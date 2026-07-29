"""Layer 2 -- Subject Selection.

- No subjects   -> workflow ends (the conditional edge in `graph.py` routes
  straight to END before this node is even reached).
- One subject   -> auto-select, no human interaction needed.
- Many subjects -> pause the graph and ask the human which one to study.
"""

from __future__ import annotations

from typing import Any

from langgraph.types import interrupt

from state import AgentState


def select_subject_node(state: AgentState) -> dict[str, Any]:
    subjects = state.get("subjects") or []

    if not subjects:
        return {"selected_subject": None}

    if len(subjects) == 1:
        return {"selected_subject": subjects[0]}

    choice = interrupt(
        {
            "type": "select_subject",
            "message": "Multiple subjects were found. Which one would you like to study?",
            "options": [s.name for s in subjects],
        }
    )
    selected = next((s for s in subjects if s.name == choice), None)
    if selected is None:
        # Defensive fallback: treat an unrecognized answer as "first subject"
        # rather than crashing an otherwise-resumable run.
        selected = subjects[0]
    return {"selected_subject": selected}
