"""Redis stream bus for quiz agents, keyed by chatId (LiveKit UI).

Mirrors the docling pipeline pattern: JSON payloads on a Redis stream via XADD,
consumers use XREAD / XREADGROUP. Every message carries ``chatId`` so the
LiveKit room ``chat-{chatId}`` stays in sync with QG and AA workers.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

import redis
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[3] / ".env.all")
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

log = logging.getLogger("quiz.redis_bus")

QUIZ_AGENT_STREAM = os.getenv("QUIZ_AGENT_STREAM", "quiz_agent_bus")
STREAM_MAXLEN = int(os.getenv("QUIZ_STREAM_MAXLEN", "10000"))

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

# Agent identity constants
AGENT_LIVEKIT = "livekit"
AGENT_QUESTION_GENERATOR = "question_generator"
AGENT_ANSWER_ANALYZER = "answer_analyzer"
AGENT_BROADCAST = "broadcast"

# Message types
TYPE_QG_START = "qg_start"
TYPE_QG_FEEDBACK = "qg_feedback"
TYPE_QUESTION_READY = "question_ready"
TYPE_QG_DONE = "qg_done"
TYPE_AA_ANALYZE = "aa_analyze"
TYPE_SCORE_READY = "score_ready"
TYPE_STATUS = "status"


def resolve_chat_id(
    *,
    chat_id: str | None = None,
    room: str | None = None,
    session_id: str | None = None,
) -> str:
    """Resolve chatId from explicit field or LiveKit room name ``chat-{chatId}``."""
    if chat_id and str(chat_id).strip():
        return str(chat_id).strip()
    for candidate in (room, session_id):
        if not candidate:
            continue
        value = str(candidate).strip()
        if value.startswith("chat-"):
            return value[len("chat-") :]
        if value:
            return value
    return "default"


def new_correlation_id() -> str:
    return str(uuid.uuid4())


class QuizBus:
    """Publish / wait / consumer-group helpers for ``quiz_agent_bus``."""

    def __init__(self) -> None:
        self.stream = QUIZ_AGENT_STREAM
        self.client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=None,
            health_check_interval=30,
        )
        self.client.ping()
        log.info(
            "quiz bus connected stream=%s host=%s:%s db=%s",
            self.stream,
            REDIS_HOST,
            REDIS_PORT,
            REDIS_DB,
        )

    def close(self) -> None:
        self.client.close()

    def publish(
        self,
        *,
        chat_id: str,
        from_agent: str,
        to_agent: str,
        type: str,
        payload: dict[str, Any] | None = None,
        correlation_id: str | None = None,
    ) -> str:
        corr = correlation_id or new_correlation_id()
        body = {
            "chatId": chat_id,
            "from": from_agent,
            "to": to_agent,
            "type": type,
            "correlationId": corr,
            "payload": payload or {},
            "ts": time.time(),
        }
        entry_id = self.client.xadd(
            self.stream,
            {"payload": json.dumps(body)},
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )
        log.info(
            "XADD %s id=%s chatId=%s %s→%s type=%s corr=%s",
            self.stream,
            entry_id,
            chat_id,
            from_agent,
            to_agent,
            type,
            corr,
        )
        return str(entry_id)

    @staticmethod
    def _parse_entry(entry_id: str, fields: dict[str, str] | list[str]) -> dict[str, Any] | None:
        if isinstance(fields, list):
            mapping = {
                fields[i]: fields[i + 1] for i in range(0, len(fields) - 1, 2)
            }
        else:
            mapping = fields
        raw = mapping.get("payload")
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        data["_id"] = entry_id
        return data

    def wait_for(
        self,
        *,
        chat_id: str,
        correlation_id: str,
        types: set[str] | tuple[str, ...],
        last_id: str,
        timeout_s: float = 60.0,
        to_agent: str | None = None,
    ) -> dict[str, Any] | None:
        """Block until a matching reply appears after ``last_id``."""
        wanted = set(types)
        deadline = time.monotonic() + timeout_s
        cursor = last_id
        while time.monotonic() < deadline:
            remaining_ms = max(1, int((deadline - time.monotonic()) * 1000))
            block_ms = min(5000, remaining_ms)
            rows = self.client.xread(
                {self.stream: cursor},
                count=20,
                block=block_ms,
            )
            if not rows:
                continue
            for _stream_name, messages in rows:
                for entry_id, fields in messages:
                    cursor = entry_id
                    msg = self._parse_entry(entry_id, fields)
                    if not msg:
                        continue
                    if msg.get("chatId") != chat_id:
                        continue
                    if msg.get("correlationId") != correlation_id:
                        continue
                    if msg.get("type") not in wanted:
                        continue
                    if to_agent and msg.get("to") not in (to_agent, AGENT_BROADCAST):
                        continue
                    return msg
        log.warning(
            "wait_for timeout chatId=%s corr=%s types=%s",
            chat_id,
            correlation_id,
            wanted,
        )
        return None

    def ensure_group(self, group: str) -> None:
        try:
            self.client.xgroup_create(self.stream, group, id="0", mkstream=True)
            log.info("created consumer group=%s on %s", group, self.stream)
        except redis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    def read_group(
        self,
        *,
        group: str,
        consumer: str,
        block_ms: int = 5000,
        count: int = 5,
    ) -> list[dict[str, Any]]:
        rows = self.client.xreadgroup(
            groupname=group,
            consumername=consumer,
            streams={self.stream: ">"},
            count=count,
            block=block_ms,
        )
        if not rows:
            return []
        out: list[dict[str, Any]] = []
        for _stream_name, messages in rows:
            for entry_id, fields in messages:
                msg = self._parse_entry(entry_id, fields)
                if msg:
                    out.append(msg)
                self.client.xack(self.stream, group, entry_id)
        return out


_bus: QuizBus | None = None


def get_bus() -> QuizBus:
    global _bus
    if _bus is None:
        _bus = QuizBus()
    return _bus


def close_bus() -> None:
    global _bus
    if _bus is not None:
        _bus.close()
        _bus = None
