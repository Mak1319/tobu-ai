"""Progressive question generator over a subject topic graph."""

from __future__ import annotations

from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import MessagesState
from langgraph.types import interrupt


class QuestionGeneratorState(MessagesState):
    subject: str
    topics: list[str]
    topic_graph: dict | None
    max_questions: int
    questions_asked: int
    history: list[dict]
    current_question: str
    correct_answer: str
    topic_id: str
    difficulty: int
    last_score_delta: int | None
    last_is_correct: bool | None
    done: bool
    status: str


def _nodes_from_graph(topic_graph: dict | None, topics: list[str]) -> list[dict]:
    if not topic_graph:
        return [{"id": t, "label": t} for t in topics] or [
            {"id": "general", "label": "general concepts"}
        ]
    nodes = list(topic_graph.get("nodes") or [])
    if topics:
        wanted = set(topics)
        filtered = [n for n in nodes if n.get("id") in wanted or n.get("label") in wanted]
        if filtered:
            return filtered
    return nodes or [{"id": "general", "label": "general concepts"}]


def _adjacency(topic_graph: dict | None) -> dict[str, list[str]]:
    adj: dict[str, list[str]] = {}
    if not topic_graph:
        return adj
    graph = topic_graph.get("graph") or {}
    if graph:
        for src, neighbors in graph.items():
            adj[src] = [
                (n["to"] if isinstance(n, dict) else str(n)) for n in (neighbors or [])
            ]
        return adj
    for edge in topic_graph.get("edges") or []:
        frm, to = edge.get("from"), edge.get("to")
        if frm and to:
            adj.setdefault(frm, []).append(to)
            adj.setdefault(to, []).append(frm)
    return adj


def _pick_topic_id(state: QuestionGeneratorState) -> tuple[str, str, int]:
    nodes = _nodes_from_graph(state.get("topic_graph"), state.get("topics") or [])
    history = state.get("history") or []
    asked = {h.get("topic_id") for h in history}
    adj = _adjacency(state.get("topic_graph"))

    last_id = history[-1]["topic_id"] if history else None
    last_ok = state.get("last_is_correct")

    candidates: list[dict] = []
    if last_id and last_id in adj:
        neighbor_ids = adj[last_id]
        by_id = {n["id"]: n for n in nodes if "id" in n}
        for nid in neighbor_ids:
            if nid in by_id and nid not in asked:
                candidates.append(by_id[nid])
        # If wrong, prefer already-seen or first neighbor; if correct, prefer unasked.
        if last_ok is False and neighbor_ids:
            nid = neighbor_ids[0]
            node = by_id.get(nid) or {"id": nid, "label": nid}
            difficulty = max(1, int(state.get("difficulty") or 2) - 1)
            return str(node["id"]), str(node.get("label") or node["id"]), difficulty

    if not candidates:
        candidates = [n for n in nodes if n.get("id") not in asked] or nodes

    node = candidates[0]
    topic_id = str(node.get("id") or "general")
    label = str(node.get("label") or topic_id)
    base = int(state.get("difficulty") or 1)
    if last_ok is True:
        difficulty = min(5, base + 1)
    elif last_ok is False:
        difficulty = max(1, base - 1)
    else:
        difficulty = base
    return topic_id, label, difficulty


def collect_context(state: QuestionGeneratorState) -> dict[str, Any]:
    subject = state.get("subject") or ""
    topics = state.get("topics") or []
    if not subject and not topics and not state.get("topic_graph"):
        return {
            "status": "missing_context",
            "done": True,
            "current_question": "",
            "correct_answer": "",
        }
    return {
        "status": "ready",
        "done": False,
        "questions_asked": int(state.get("questions_asked") or 0),
        "history": list(state.get("history") or []),
        "max_questions": int(state.get("max_questions") or 5),
        "difficulty": int(state.get("difficulty") or 1),
    }


def generate(state: QuestionGeneratorState) -> dict[str, Any]:
    if state.get("done"):
        return {"status": "done"}

    max_q = int(state.get("max_questions") or 5)
    asked_n = int(state.get("questions_asked") or 0)
    if asked_n >= max_q:
        return {
            "done": True,
            "status": "done",
            "current_question": "",
            "correct_answer": "",
        }

    subject = state.get("subject") or "this subject"
    topic_id, label, difficulty = _pick_topic_id(state)
    question = (
        f"In {subject}, briefly explain {label}. "
        f"What is the key idea behind {label}?"
    )
    correct_answer = f"The key idea of {label} in {subject}"

    return {
        "topic_id": topic_id,
        "current_question": question,
        "correct_answer": correct_answer,
        "difficulty": difficulty,
        "questions_asked": asked_n + 1,
        "status": "awaiting_feedback",
        "done": False,
    }


def await_feedback(state: QuestionGeneratorState) -> dict[str, Any]:
    if state.get("done"):
        return {"status": "done"}

    feedback = interrupt(
        {
            "type": "await_feedback",
            "question": state.get("current_question"),
            "correct_answer": state.get("correct_answer"),
            "topic_id": state.get("topic_id"),
            "difficulty": state.get("difficulty"),
            "questions_asked": state.get("questions_asked"),
        }
    )

    if isinstance(feedback, dict) and feedback.get("done"):
        return {"done": True, "status": "done"}

    provided = ""
    is_correct = None
    score_delta = None
    if isinstance(feedback, dict):
        provided = str(feedback.get("provided_answer") or "")
        is_correct = feedback.get("is_correct")
        score_delta = feedback.get("score_delta")

    history = list(state.get("history") or [])
    history.append(
        {
            "topic_id": state.get("topic_id"),
            "question": state.get("current_question"),
            "correct_answer": state.get("correct_answer"),
            "provided_answer": provided,
            "is_correct": is_correct,
            "score_delta": score_delta,
        }
    )
    return {
        "history": history,
        "last_is_correct": bool(is_correct) if is_correct is not None else None,
        "last_score_delta": int(score_delta) if score_delta is not None else None,
        "status": "feedback_received",
    }


def mark_done(state: QuestionGeneratorState) -> dict[str, Any]:
    return {"done": True, "status": "done"}


def route_after_feedback(state: QuestionGeneratorState) -> str:
    if state.get("done"):
        return "done"
    max_q = int(state.get("max_questions") or 5)
    if int(state.get("questions_asked") or 0) >= max_q:
        return "done"
    return "generate"


builder = StateGraph(QuestionGeneratorState)
builder.add_node("collect_context", collect_context)
builder.add_node("generate", generate)
builder.add_node("await_feedback", await_feedback)
builder.add_node("mark_done", mark_done)

builder.add_edge(START, "collect_context")
builder.add_edge("collect_context", "generate")
builder.add_edge("generate", "await_feedback")
builder.add_conditional_edges(
    "await_feedback",
    route_after_feedback,
    {"generate": "generate", "done": "mark_done"},
)
builder.add_edge("mark_done", END)

graph = builder.compile(checkpointer=MemorySaver())
