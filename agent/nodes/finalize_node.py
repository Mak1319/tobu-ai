"""Terminal node -- summarizes the full adaptive-quiz session once the learner
decides not to continue (see `nodes.human_loop.interrupts.ask_continue_node`).
"""

from __future__ import annotations

from typing import Any

from services.scoring import (
    overall_average,
    per_topic_average,
    total_questions,
    total_score,
)
from state import AgentState


def finalize_node(state: AgentState) -> dict[str, Any]:
    history = state.get("round_history") or []
    subject = state.get("selected_subject")

    summary = {
        "subject": subject.name if subject else None,
        "rounds_completed": len(history),
        "questions_answered": total_questions(history),
        "total_score": total_score(history),
        "average_score": overall_average(history),
        "per_topic_average": per_topic_average(history),
    }
    return {"summary": summary}
