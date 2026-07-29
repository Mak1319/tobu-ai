"""Layer 5 -- Topic Extension.

Divides every extracted topic into granular subtopics, staying strictly
within that topic's scope (no cross-topic leakage).
"""

from __future__ import annotations

from nodes._llm import structured_llm_call
from prompts import TOPIC_EXTENSION_PROMPT
from schemas.topics import TopicExtensionResult
from state import AgentState


def extend_topics_node(state: AgentState) -> dict[str, dict[str, list[str]]]:
    topics = state.get("topics") or []
    subtopics_by_topic: dict[str, list[str]] = {}
    user_id = state.get("user_id")

    for topic in topics:
        result = structured_llm_call(
            user_id,
            TOPIC_EXTENSION_PROMPT.format(topic_name=topic.name, topic_text=topic.text),
            TopicExtensionResult,
        )
        subtopics_by_topic[topic.name] = result.subtopics or [topic.name]

    return {"subtopics_by_topic": subtopics_by_topic}
