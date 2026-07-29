"""Layer 6 -- Topic Selection.

Pauses the graph and asks the human which topic (or subtopic) to focus on
for the first round of questions.
"""

from __future__ import annotations

from langgraph.types import interrupt

from state import AgentState


def select_topic_node(state: AgentState) -> dict[str, str | None]:
    subtopics_by_topic = state.get("subtopics_by_topic") or {}
    options = [
        f"{topic} :: {subtopic}"
        for topic, subtopics in subtopics_by_topic.items()
        for subtopic in subtopics
    ]

    if not options:
        return {"selected_topic": None}

    choice = interrupt(
        {
            "type": "select_topic",
            "message": "Which topic would you like to focus on?",
            "options": options,
        }
    )
    selected = choice if choice in options else options[0]
    return {"selected_topic": selected}
