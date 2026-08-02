"""Answer-analyzer worker: consumes Redis bus analyze requests."""

from __future__ import annotations

import logging
import os
from typing import Any

from answer_analyzer_agent.graph import graph as analyzer_graph
from shared.redis_bus import (
    AGENT_ANSWER_ANALYZER,
    AGENT_LIVEKIT,
    TYPE_AA_ANALYZE,
    TYPE_SCORE_READY,
    QuizBus,
    get_bus,
)

log = logging.getLogger("quiz.aa_worker")

GROUP = "answer_analyzer"
CONSUMER = os.getenv("AA_CONSUMER_NAME", "aa-1")


def handle_message(bus: QuizBus, msg: dict[str, Any]) -> None:
    if msg.get("to") != AGENT_ANSWER_ANALYZER:
        return
    if msg.get("type") != TYPE_AA_ANALYZE:
        return

    chat_id = str(msg.get("chatId") or "default")
    corr = str(msg.get("correlationId") or "")
    payload = msg.get("payload") or {}

    result = analyzer_graph.invoke(
        {
            "question": payload.get("question") or "",
            "provided_answer": payload.get("provided_answer") or "",
            "correct_answer": payload.get("correct_answer") or "",
            "user_id": payload.get("user_id") or "",
            "session_id": chat_id,
            "topic_id": payload.get("topic_id") or "",
            "cumulative_score": int(payload.get("cumulative_score") or 0),
            "messages": [],
        },
        {
            "configurable": {
                "thread_id": f"aa-{chat_id}-{payload.get('topic_id') or 'x'}"
            }
        },
    )

    bus.publish(
        chat_id=chat_id,
        from_agent=AGENT_ANSWER_ANALYZER,
        to_agent=AGENT_LIVEKIT,
        type=TYPE_SCORE_READY,
        correlation_id=corr,
        payload={
            "score_delta": result.get("score_delta"),
            "is_correct": result.get("is_correct"),
            "cumulative_score": result.get("cumulative_score"),
            "rationale": result.get("rationale") or "",
            "topic_id": payload.get("topic_id") or "",
        },
    )


def run_forever(stop_flag: list[bool] | None = None) -> None:
    bus = get_bus()
    bus.ensure_group(GROUP)
    log.info("AA worker listening group=%s consumer=%s", GROUP, CONSUMER)
    while True:
        if stop_flag and stop_flag[0]:
            break
        try:
            messages = bus.read_group(group=GROUP, consumer=CONSUMER, block_ms=5000)
        except Exception:
            log.exception("AA worker read failed")
            continue
        for msg in messages:
            try:
                handle_message(bus, msg)
            except Exception:
                log.exception(
                    "AA handler failed chatId=%s type=%s",
                    msg.get("chatId"),
                    msg.get("type"),
                )
