"""Layer 5 (cont.) -- Topic Graph Generation.

Builds a relationship graph across every topic/subtopic extracted so far.
This graph is later used by the progressive-question layer to pick related
topics for the next round.
"""

from __future__ import annotations

from nodes._llm import structured_llm_call
from prompts import TOPIC_GRAPH_PROMPT
from schemas.graph import TopicGraph
from state import AgentState


def generate_topic_graph_node(state: AgentState) -> dict[str, TopicGraph]:
    subtopics_by_topic = state.get("subtopics_by_topic") or {}
    all_items = [
        subtopic for subtopics in subtopics_by_topic.values() for subtopic in subtopics
    ] or list(subtopics_by_topic.keys())

    if not all_items:
        return {"topic_graph": TopicGraph()}

    topic_list = "\n".join(f"- {item}" for item in all_items)
    graph = structured_llm_call(
        state.get("user_id"),
        TOPIC_GRAPH_PROMPT.format(topic_list=topic_list),
        TopicGraph,
    )
    return {"topic_graph": graph}
