"""Layer 3 -- Topic Extraction.

Extracts topics from the syllabus text belonging to the subject selected in
the previous layer.
"""

from __future__ import annotations

from typing import Any

from nodes._llm import structured_llm_call
from prompts import TOPIC_EXTRACTION_PROMPT
from schemas.subjects import Subject
from schemas.topics import TopicExtractionResult
from state import AgentState


def extract_topics_node(state: AgentState) -> dict[str, Any]:
    subject: Subject | None = state.get("selected_subject")
    if subject is None:
        # Upstream subject selection should have populated this; if it didn't
        # we end the run by leaving topics empty and surfacing no_subjects_found
        # so the conditional edge terminates the workflow.
        return {"topics": [], "no_subjects_found": True}
    result = structured_llm_call(
        state.get("user_id"),
        TOPIC_EXTRACTION_PROMPT.format(
            subject_name=subject.name, subject_text=subject.text
        ),
        TopicExtractionResult,
    )
    return {"topics": result.topics}
