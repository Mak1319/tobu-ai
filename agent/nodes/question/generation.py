"""Layer 7 -- Question Generation (first round).

Generates the initial 10 question/answer pairs for `state["selected_topic"]`.
"""

from __future__ import annotations

from typing import Any

from services.question_service import generate_question_set
from state import AgentState


def generate_questions_node(state: AgentState) -> dict[str, Any]:
    topic_name = state.get("selected_topic") or "General"
    questions = generate_question_set(state.get("user_id"), topic_name)
    return {
        "current_questions": questions,
        "round_number": state.get("round_number", 0) + 1,
        "user_answers": [],
    }
