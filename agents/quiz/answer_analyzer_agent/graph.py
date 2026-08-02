"""Answer analyzer: score user answer vs correct answer; persist delta."""

from __future__ import annotations

import re
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import MessagesState

import database


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text)


class AnalyzerState(MessagesState):
    question: str
    provided_answer: str
    correct_answer: str
    user_id: str
    session_id: str
    topic_id: str
    score_delta: int
    is_correct: bool
    rationale: str
    cumulative_score: int
    status: str


def evaluate(state: AnalyzerState) -> dict[str, Any]:
    provided = _normalize(state.get("provided_answer") or "")
    correct = _normalize(state.get("correct_answer") or "")

    if not provided or not correct:
        return {
            "score_delta": -1,
            "is_correct": False,
            "rationale": "Missing answer or reference answer.",
            "status": "evaluated",
        }

    if provided == correct or correct in provided or provided in correct:
        delta = 1
        ok = True
        rationale = "Answer matches the reference."
    else:
        delta = -1
        ok = False
        rationale = "Answer does not match the reference."

    prev = int(state.get("cumulative_score") or 0)
    return {
        "score_delta": delta,
        "is_correct": ok,
        "rationale": rationale,
        "cumulative_score": prev + delta,
        "status": "evaluated",
    }


def store(state: AnalyzerState) -> dict[str, Any]:
    database.store_score_sync(
        {
            "user_id": state.get("user_id") or "",
            "session_id": state.get("session_id") or "",
            "topic_id": state.get("topic_id") or "",
            "question": state.get("question") or "",
            "provided_answer": state.get("provided_answer") or "",
            "correct_answer": state.get("correct_answer") or "",
            "score_delta": int(state.get("score_delta") or 0),
            "cumulative_score": int(state.get("cumulative_score") or 0),
            "is_correct": bool(state.get("is_correct")),
            "rationale": state.get("rationale") or "",
        }
    )
    return {"status": "stored"}


builder = StateGraph(AnalyzerState)
builder.add_node("evaluate", evaluate)
builder.add_node("store", store)
builder.add_edge(START, "evaluate")
builder.add_edge("evaluate", "store")
builder.add_edge("store", END)

graph = builder.compile(checkpointer=MemorySaver())
