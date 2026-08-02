"""Question-generator worker: consumes Redis bus messages for this agent."""

from __future__ import annotations

import logging
import os
from typing import Any

from langgraph.types import Command

from question_generator_agent.graph import graph as question_graph
from shared.redis_bus import (
    AGENT_LIVEKIT,
    AGENT_QUESTION_GENERATOR,
    TYPE_QG_DONE,
    TYPE_QG_FEEDBACK,
    TYPE_QG_START,
    TYPE_QUESTION_READY,
    QuizBus,
    get_bus,
)

log = logging.getLogger("quiz.qg_worker")

GROUP = "question_generator"
CONSUMER = os.getenv("QG_CONSUMER_NAME", "qg-1")


def _interrupt_value(result: dict[str, Any] | Any) -> dict[str, Any] | None:
    if not isinstance(result, dict):
        return None
    interrupts = result.get("__interrupt__")
    if not interrupts:
        return None
    first = interrupts[0]
    value = getattr(first, "value", first)
    return value if isinstance(value, dict) else {"raw": value}


def _qg_config(chat_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": f"qg-{chat_id}"}}


def _publish_question_or_done(
    bus: QuizBus,
    *,
    chat_id: str,
    correlation_id: str,
    result: dict[str, Any],
) -> None:
    payload = _interrupt_value(result)
    if payload and payload.get("question"):
        bus.publish(
            chat_id=chat_id,
            from_agent=AGENT_QUESTION_GENERATOR,
            to_agent=AGENT_LIVEKIT,
            type=TYPE_QUESTION_READY,
            correlation_id=correlation_id,
            payload={
                "question": payload.get("question"),
                "correct_answer": payload.get("correct_answer"),
                "topic_id": payload.get("topic_id"),
                "difficulty": payload.get("difficulty", 1),
                "questions_asked": payload.get("questions_asked"),
            },
        )
        return

    bus.publish(
        chat_id=chat_id,
        from_agent=AGENT_QUESTION_GENERATOR,
        to_agent=AGENT_LIVEKIT,
        type=TYPE_QG_DONE,
        correlation_id=correlation_id,
        payload={"done": True, "history": result.get("history") or []},
    )


def handle_message(bus: QuizBus, msg: dict[str, Any]) -> None:
    if msg.get("to") != AGENT_QUESTION_GENERATOR:
        return
    msg_type = msg.get("type")
    chat_id = str(msg.get("chatId") or "default")
    corr = str(msg.get("correlationId") or "")
    payload = msg.get("payload") or {}
    config = _qg_config(chat_id)

    if msg_type == TYPE_QG_START:
        result = question_graph.invoke(
            {
                "subject": payload.get("subject") or "",
                "topics": payload.get("topics") or [],
                "topic_graph": payload.get("topic_graph"),
                "max_questions": int(payload.get("max_questions") or 5),
                "messages": [],
            },
            config,
        )
        _publish_question_or_done(
            bus, chat_id=chat_id, correlation_id=corr, result=result
        )
        return

    if msg_type == TYPE_QG_FEEDBACK:
        result = question_graph.invoke(
            Command(
                resume={
                    "provided_answer": payload.get("provided_answer") or "",
                    "is_correct": payload.get("is_correct"),
                    "score_delta": payload.get("score_delta"),
                    "done": payload.get("done"),
                }
            ),
            config,
        )
        _publish_question_or_done(
            bus, chat_id=chat_id, correlation_id=corr, result=result
        )
        return

    log.debug("qg ignore type=%s chatId=%s", msg_type, chat_id)


def run_forever(stop_flag: list[bool] | None = None) -> None:
    bus = get_bus()
    bus.ensure_group(GROUP)
    log.info("QG worker listening group=%s consumer=%s", GROUP, CONSUMER)
    while True:
        if stop_flag and stop_flag[0]:
            break
        try:
            messages = bus.read_group(group=GROUP, consumer=CONSUMER, block_ms=5000)
        except Exception:
            log.exception("QG worker read failed")
            continue
        for msg in messages:
            try:
                handle_message(bus, msg)
            except Exception:
                log.exception(
                    "QG handler failed chatId=%s type=%s",
                    msg.get("chatId"),
                    msg.get("type"),
                )
