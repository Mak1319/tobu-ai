"""Layer 10 -- Progressive Question Making.

Combines the previous round's scores, the topic relationship graph, and a
random exploration factor to pick the next topic, then generates that
topic's 10 question/answer pairs via the same service used for round one.
"""

from __future__ import annotations

import random
from typing import Any

from services.question_service import generate_question_set
from state import AgentState

# Chance of picking a completely fresh topic instead of one related to the
# most recently covered topic -- keeps the quiz from feeling fully
# predictable while still being mostly graph-guided.
RANDOM_EXPLORATION_CHANCE = 0.25


def _all_available_topics(state: AgentState) -> list[str]:
    subtopics_by_topic = state.get("subtopics_by_topic") or {}
    flattened = [
        subtopic for subtopics in subtopics_by_topic.values() for subtopic in subtopics
    ]
    return flattened or list(subtopics_by_topic.keys())


def _related_topics(state: AgentState, topic: str) -> list[str]:
    graph = state.get("topic_graph")
    if graph is None:
        return []
    related: list[str] = []
    for edge in graph.neighbors(topic):
        related.append(edge.target if edge.source == topic else edge.source)
    return related


def _pick_next_topic(state: AgentState) -> str:
    available = _all_available_topics(state)
    if not available:
        return state.get("selected_topic") or "General"

    history = state.get("round_history") or []
    last_topic = history[-1].topic if history else None

    candidates = _related_topics(state, last_topic) if last_topic else []
    candidates = [c for c in candidates if c in available] or available

    if random.random() < RANDOM_EXPLORATION_CHANCE:
        return random.choice(available)
    return random.choice(candidates)


def generate_progressive_questions_node(state: AgentState) -> dict[str, Any]:
    next_topic = _pick_next_topic(state)
    questions = generate_question_set(state.get("user_id"), next_topic)
    return {
        "selected_topic": next_topic,
        "current_questions": questions,
        "round_number": state.get("round_number", 0) + 1,
        "user_answers": [],
    }
