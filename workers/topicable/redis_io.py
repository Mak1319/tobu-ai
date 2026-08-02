"""Redis list input (MinIO RPUSH) + stream output (XADD docling_result)."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Any
from urllib.parse import unquote_plus

import redis

from config import Settings

log = logging.getLogger("topicable.redis")


class RedisIO:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        log.debug(
            "redis connect host=%s port=%s db=%s",
            settings.redis_host,
            settings.redis_port,
            settings.redis_db,
        )
        self.client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=None,
            health_check_interval=30,
        )
        try:
            pong = self.client.ping()
            log.info("redis ping=%s", pong)
        except redis.RedisError as exc:
            log.error("redis ping failed: %s", exc)
            raise

    def blpop(self) -> str | None:
        """Block on MinIO event list. Returns raw message or None on timeout."""
        log.debug(
            "BLPOP list=%s timeout=%ss",
            self.settings.redis_event_list,
            self.settings.block_seconds,
        )
        item = self.client.blpop(
            self.settings.redis_event_list,
            timeout=self.settings.block_seconds,
        )
        if item is None:
            return None
        list_name, message = item
        log.debug(
            "BLPOP hit list=%s bytes=%d",
            list_name,
            len(message) if isinstance(message, str) else -1,
        )
        return message

    def list_length(self) -> int:
        n = int(self.client.llen(self.settings.redis_event_list))
        log.debug("LLEN %s = %d", self.settings.redis_event_list, n)
        return n

    def publish(self, payload: dict[str, Any]) -> str:
        body = json.dumps(payload)
        log.debug(
            "XADD stream=%s status=%s payload_bytes=%d",
            self.settings.redis_output_stream,
            payload.get("status"),
            len(body),
        )
        entry_id = self.client.xadd(
            self.settings.redis_output_stream,
            {"payload": body},
            maxlen=self.settings.stream_maxlen,
            approximate=True,
        )
        log.info(
            "→ xadd status=%s id=%s on %s session=%s hash=%s",
            payload.get("status"),
            entry_id,
            self.settings.redis_output_stream,
            payload.get("sessionId"),
            payload.get("fileHash"),
        )
        return str(entry_id)

    def close(self) -> None:
        log.debug("closing redis client")
        self.client.close()


def _meta_get(metadata: dict[str, Any], *names: str) -> str | None:
    wanted = {name.lower().replace("-", "_") for name in names}
    for key, value in metadata.items():
        normalized = str(key).lower().replace("-", "_").removeprefix("x_amz_meta_")
        if normalized in wanted and value is not None:
            return str(value)
    return None


def _iter_records(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from _iter_records(item)
        return
    if not isinstance(value, dict):
        return

    records = value.get("Records")
    if isinstance(records, list):
        for record in records:
            yield from _iter_records(record)
        return

    events = value.get("Event")
    if isinstance(events, list):
        for event in events:
            yield from _iter_records(event)
        return

    if "s3" in value or "eventName" in value or "EventName" in value:
        yield value


def _from_minio_record(record: dict[str, Any]) -> dict[str, str | None]:
    event_name = str(record.get("eventName", record.get("EventName", "")))
    if event_name and not event_name.startswith("s3:ObjectCreated"):
        log.debug("skip non-create eventName=%s", event_name)
        return {"sessionId": None, "uploadKey": None, "fileHash": None}

    s3_event = record.get("s3") or {}
    obj = s3_event.get("object") or {}
    raw_key = obj.get("key") or obj.get("Key") or record.get("Key")
    upload_key = unquote_plus(str(raw_key)) if raw_key else None

    meta = obj.get("userMetadata") or obj.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}

    session_id = _meta_get(
        meta,
        "sessionId",
        "session_id",
        "session-id",
        "chat_id",
        "chat-id",
    )
    file_hash = _meta_get(
        meta,
        "fileHash",
        "file_hash",
        "file-hash",
        "hash",
        "hashId",
        "hash_id",
    )

    # Fallback: first path segment is often the session/chat id.
    if not session_id and upload_key and "/" in upload_key:
        session_id = upload_key.split("/", 1)[0]
        log.debug("sessionId fallback from key prefix=%s", session_id)

    # Fallback: S3 eTag (often quoted hex) if metadata hash missing.
    if not file_hash:
        etag = obj.get("eTag") or obj.get("etag") or obj.get("ETag")
        if etag:
            file_hash = str(etag).strip('"')
            log.debug("fileHash fallback from eTag=%s", file_hash)

    return {
        "sessionId": session_id,
        "uploadKey": upload_key,
        "fileHash": file_hash,
    }


def _from_mapping(data: dict[str, Any]) -> dict[str, str | None]:
    session_id = (
        data.get("sessionId")
        or data.get("session_id")
        or data.get("sessionid")
    )
    upload_key = (
        data.get("uploadKey")
        or data.get("upload_key")
        or data.get("uploadkey")
        or data.get("key")
    )
    file_hash = (
        data.get("fileHash")
        or data.get("file_hash")
        or data.get("filehash")
        or data.get("hash")
        or data.get("hashId")
    )
    if upload_key is not None:
        upload_key = unquote_plus(str(upload_key))
    return {
        "sessionId": str(session_id) if session_id else None,
        "uploadKey": str(upload_key) if upload_key else None,
        "fileHash": str(file_hash) if file_hash else None,
    }


def parse_list_message(raw: str) -> dict[str, str | None]:
    """Parse a MinIO Redis-list message into sessionId / uploadKey / fileHash."""
    log.debug("parse_list_message chars=%d preview=%s", len(raw), raw[:240])

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.warning("list message is not valid JSON: %s", exc)
        return {"sessionId": None, "uploadKey": None, "fileHash": None}

    # Direct flat payload: {"sessionId","uploadKey","fileHash"}
    if isinstance(payload, dict) and not (
        "Records" in payload or "Event" in payload or "s3" in payload
    ):
        # Nested under payload/data/message
        nested = payload.get("payload") or payload.get("data") or payload.get("message")
        if isinstance(nested, str):
            try:
                nested = json.loads(nested)
            except json.JSONDecodeError:
                nested = None
        if isinstance(nested, dict):
            log.debug("using nested payload object")
            parsed = _from_mapping(nested)
            if parsed["uploadKey"] or parsed["fileHash"]:
                log.debug("parsed event=%s", parsed)
                return parsed
        parsed = _from_mapping(payload)
        log.debug("parsed flat event=%s", parsed)
        return parsed

    # MinIO notification shape(s)
    for record in _iter_records(payload):
        parsed = _from_minio_record(record)
        if parsed["uploadKey"]:
            log.debug("parsed MinIO event=%s", parsed)
            return parsed

    log.warning("could not extract uploadKey/fileHash from list message")
    return {"sessionId": None, "uploadKey": None, "fileHash": None}
