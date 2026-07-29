"""Human-in-the-loop node that asks whether to continue into another
progressive round or end the session.
"""

from __future__ import annotations

from typing import Any

from langgraph.types import interrupt

from state import AgentState


def ask_continue_node(state: AgentState) -> dict[str, Any]:
    history = state.get("round_history") or []
    latest = history[-1] if history else None

    response = interrupt(
        {
            "type": "continue_session",
            "message": "Would you like another round of questions?",
            "last_round_summary": (
                {
                    "round_number": latest.round_number,
                    "topic": latest.topic,
                    "average_score": latest.average_score,
                }
                if latest
                else None
            ),
        }
    )
    truthy = str(response).strip().lower() in {"y", "yes", "true", "1", "continue"}
    return {"continue_session": truthy}
