"""LiveKit voice orchestrator: greets user and syncs QG/AA via Redis + chatId."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import MessagesState
from langgraph.types import interrupt

from shared.checkpointer import get_checkpointer
from shared.redis_bus import (
    AGENT_ANSWER_ANALYZER,
    AGENT_BROADCAST,
    AGENT_LIVEKIT,
    AGENT_QUESTION_GENERATOR,
    TYPE_AA_ANALYZE,
    TYPE_QG_DONE,
    TYPE_QG_FEEDBACK,
    TYPE_QG_START,
    TYPE_QUESTION_READY,
    TYPE_SCORE_READY,
    TYPE_STATUS,
    get_bus,
    new_correlation_id,
    resolve_chat_id,
)


class LivekitState(MessagesState):
    chat_id: str
    room: str
    user_id: str
    subject: str
    topics: list[str]
    topic_graph: dict | None
    max_questions: int
    greeting: str
    spoken_prompt: str
    current_question: str
    correct_answer: str
    topic_id: str
    difficulty: int
    raw_user_utterance: str
    provided_answer: str
    score_delta: int | None
    is_correct: bool | None
    cumulative_score: int
    interaction_history: list[dict]
    qg_done: bool
    status: str


def _chat_id(state: LivekitState) -> str:
    return resolve_chat_id(
        chat_id=state.get("chat_id"),
        room=state.get("room"),
        session_id=state.get("user_id"),
    )


def greet(state: LivekitState) -> dict[str, Any]:
    chat_id = _chat_id(state)
    hour = datetime.now(ZoneInfo("Asia/Kolkata")).hour
    if hour < 12:
        period = "Good morning"
    elif hour < 17:
        period = "Good afternoon"
    else:
        period = "Good evening"

    subject = state.get("subject") or "your topics"
    greeting = (
        f"{period}. Welcome to your study session on {subject}. "
        "I'll ask you a few questions — answer in your own words."
    )

    bus = get_bus()
    bus.publish(
        chat_id=chat_id,
        from_agent=AGENT_LIVEKIT,
        to_agent=AGENT_BROADCAST,
        type=TYPE_STATUS,
        payload={"status": "greeting", "greeting": greeting, "room": f"chat-{chat_id}"},
    )

    return {
        "chat_id": chat_id,
        "room": state.get("room") or f"chat-{chat_id}",
        "greeting": greeting,
        "spoken_prompt": greeting,
        "status": "greeting",
        "cumulative_score": int(state.get("cumulative_score") or 0),
        "interaction_history": list(state.get("interaction_history") or []),
        "qg_done": False,
        "max_questions": int(state.get("max_questions") or 5),
    }


def trigger_question_generator(state: LivekitState) -> dict[str, Any]:
    chat_id = _chat_id(state)
    bus = get_bus()
    corr = new_correlation_id()
    entry_id = bus.publish(
        chat_id=chat_id,
        from_agent=AGENT_LIVEKIT,
        to_agent=AGENT_QUESTION_GENERATOR,
        type=TYPE_QG_START,
        correlation_id=corr,
        payload={
            "subject": state.get("subject") or "",
            "topics": state.get("topics") or [],
            "topic_graph": state.get("topic_graph"),
            "max_questions": int(state.get("max_questions") or 5),
        },
    )
    reply = bus.wait_for(
        chat_id=chat_id,
        correlation_id=corr,
        types={TYPE_QUESTION_READY, TYPE_QG_DONE},
        last_id=entry_id,
        timeout_s=60.0,
        to_agent=AGENT_LIVEKIT,
    )
    if not reply:
        return {
            "qg_done": True,
            "current_question": "",
            "correct_answer": "",
            "status": "qg_timeout",
        }
    if reply.get("type") == TYPE_QG_DONE:
        return {
            "qg_done": True,
            "current_question": "",
            "correct_answer": "",
            "status": "session_complete",
        }
    payload = reply.get("payload") or {}
    return {
        "current_question": str(payload.get("question") or ""),
        "correct_answer": str(payload.get("correct_answer") or ""),
        "topic_id": str(payload.get("topic_id") or ""),
        "difficulty": int(payload.get("difficulty") or 1),
        "qg_done": False,
        "status": "question_ready",
    }


def humanize_and_ask(state: LivekitState) -> dict[str, Any]:
    chat_id = _chat_id(state)
    if state.get("qg_done") or not state.get("current_question"):
        spoken = "That's all for now. Great work today."
        get_bus().publish(
            chat_id=chat_id,
            from_agent=AGENT_LIVEKIT,
            to_agent=AGENT_BROADCAST,
            type=TYPE_STATUS,
            payload={"status": "session_complete", "spoken_prompt": spoken},
        )
        return {
            "spoken_prompt": spoken,
            "status": "session_complete",
            "qg_done": True,
        }

    history = state.get("interaction_history") or []
    if history:
        last = history[-1]
        if last.get("is_correct"):
            bridge = "Nice — you got the last one. Here's another."
        else:
            bridge = "No worries on the last one. Let's try a related idea."
    else:
        bridge = "Here's your first question."

    spoken = f"{bridge} {state['current_question']}"
    get_bus().publish(
        chat_id=chat_id,
        from_agent=AGENT_LIVEKIT,
        to_agent=AGENT_BROADCAST,
        type=TYPE_STATUS,
        payload={
            "status": "asking",
            "spoken_prompt": spoken,
            "question": state.get("current_question"),
            "topic_id": state.get("topic_id"),
        },
    )
    return {"spoken_prompt": spoken, "status": "asking"}


def wait_user_answer(state: LivekitState) -> dict[str, Any]:
    if state.get("qg_done"):
        return {"status": "session_complete"}

    resume = interrupt(
        {
            "type": "user_answer",
            "chatId": _chat_id(state),
            "prompt": state.get("spoken_prompt"),
            "question": state.get("current_question"),
            "topic_id": state.get("topic_id"),
        }
    )
    utterance = (
        resume
        if isinstance(resume, str)
        else str(
            (resume or {}).get("utterance")
            or (resume or {}).get("answer")
            or resume
            or ""
        )
    )
    return {"raw_user_utterance": utterance, "status": "answer_received"}


def extract_answer(state: LivekitState) -> dict[str, Any]:
    raw = (state.get("raw_user_utterance") or "").strip()
    fillers = (
        "i think",
        "maybe",
        "um",
        "uh",
        "well",
        "so",
        "basically",
        "i guess",
    )
    text = raw
    lower = text.lower()
    for f in fillers:
        if lower.startswith(f + " "):
            text = text[len(f) :].strip(" ,.-")
            lower = text.lower()
    if text.lower().startswith("the answer is "):
        text = text[14:].strip()
    return {"provided_answer": text or raw, "status": "answer_extracted"}


def run_answer_analyzer(state: LivekitState) -> dict[str, Any]:
    chat_id = _chat_id(state)
    bus = get_bus()
    corr = new_correlation_id()
    entry_id = bus.publish(
        chat_id=chat_id,
        from_agent=AGENT_LIVEKIT,
        to_agent=AGENT_ANSWER_ANALYZER,
        type=TYPE_AA_ANALYZE,
        correlation_id=corr,
        payload={
            "question": state.get("current_question") or "",
            "provided_answer": state.get("provided_answer") or "",
            "correct_answer": state.get("correct_answer") or "",
            "user_id": state.get("user_id") or "",
            "topic_id": state.get("topic_id") or "",
            "cumulative_score": int(state.get("cumulative_score") or 0),
        },
    )
    reply = bus.wait_for(
        chat_id=chat_id,
        correlation_id=corr,
        types={TYPE_SCORE_READY},
        last_id=entry_id,
        timeout_s=60.0,
        to_agent=AGENT_LIVEKIT,
    )
    payload = (reply or {}).get("payload") or {}
    history = list(state.get("interaction_history") or [])
    history.append(
        {
            "question": state.get("current_question"),
            "provided_answer": state.get("provided_answer"),
            "correct_answer": state.get("correct_answer"),
            "topic_id": state.get("topic_id"),
            "is_correct": payload.get("is_correct"),
            "score_delta": payload.get("score_delta"),
        }
    )
    return {
        "score_delta": payload.get("score_delta"),
        "is_correct": payload.get("is_correct"),
        "cumulative_score": int(
            payload.get("cumulative_score") or state.get("cumulative_score") or 0
        ),
        "interaction_history": history,
        "status": "analyzed",
    }


def resume_question_generator(state: LivekitState) -> dict[str, Any]:
    chat_id = _chat_id(state)
    bus = get_bus()
    corr = new_correlation_id()
    entry_id = bus.publish(
        chat_id=chat_id,
        from_agent=AGENT_LIVEKIT,
        to_agent=AGENT_QUESTION_GENERATOR,
        type=TYPE_QG_FEEDBACK,
        correlation_id=corr,
        payload={
            "provided_answer": state.get("provided_answer") or "",
            "is_correct": state.get("is_correct"),
            "score_delta": state.get("score_delta"),
        },
    )
    reply = bus.wait_for(
        chat_id=chat_id,
        correlation_id=corr,
        types={TYPE_QUESTION_READY, TYPE_QG_DONE},
        last_id=entry_id,
        timeout_s=60.0,
        to_agent=AGENT_LIVEKIT,
    )
    if not reply or reply.get("type") == TYPE_QG_DONE:
        return {
            "qg_done": True,
            "current_question": "",
            "correct_answer": "",
            "status": "session_complete",
        }
    payload = reply.get("payload") or {}
    question = str(payload.get("question") or "")
    if not question:
        return {
            "qg_done": True,
            "current_question": "",
            "correct_answer": "",
            "status": "session_complete",
        }
    return {
        "current_question": question,
        "correct_answer": str(payload.get("correct_answer") or ""),
        "topic_id": str(payload.get("topic_id") or ""),
        "difficulty": int(payload.get("difficulty") or 1),
        "qg_done": False,
        "status": "question_ready",
    }


def route_after_ask(state: LivekitState) -> str:
    if state.get("qg_done") or not state.get("current_question"):
        return "end"
    return "wait_answer"


def route_after_resume(state: LivekitState) -> str:
    if state.get("qg_done") or not state.get("current_question"):
        return "end"
    return "ask_again"


builder = StateGraph(LivekitState)
builder.add_node("greet", greet)
builder.add_node("trigger_question_generator", trigger_question_generator)
builder.add_node("humanize_and_ask", humanize_and_ask)
builder.add_node("wait_user_answer", wait_user_answer)
builder.add_node("extract_answer", extract_answer)
builder.add_node("run_answer_analyzer", run_answer_analyzer)
builder.add_node("resume_question_generator", resume_question_generator)

builder.add_edge(START, "greet")
builder.add_edge("greet", "trigger_question_generator")
builder.add_edge("trigger_question_generator", "humanize_and_ask")
builder.add_conditional_edges(
    "humanize_and_ask",
    route_after_ask,
    {"wait_answer": "wait_user_answer", "end": END},
)
builder.add_edge("wait_user_answer", "extract_answer")
builder.add_edge("extract_answer", "run_answer_analyzer")
builder.add_edge("run_answer_analyzer", "resume_question_generator")
builder.add_conditional_edges(
    "resume_question_generator",
    route_after_resume,
    {"ask_again": "humanize_and_ask", "end": END},
)

graph = builder.compile(checkpointer=get_checkpointer())
