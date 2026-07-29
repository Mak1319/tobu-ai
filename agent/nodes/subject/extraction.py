"""Layer 1 -- Subject Extraction.

Splits the raw syllabus text into subjects. Per spec: if the syllabus text
isn't organized into distinct subjects, the whole text is still returned as
a single subject so the rest of the pipeline always has something to work
with.
"""

from __future__ import annotations

from typing import Any

from nodes._llm import structured_llm_call
from prompts import SUBJECT_EXTRACTION_PROMPT
from schemas.subjects import SubjectExtractionResult
from state import AgentState


def extract_subjects_node(state: AgentState) -> dict[str, Any]:
    syllabus_text: str | None = state.get("syllabus_text")
    if not syllabus_text or not syllabus_text.strip():
        return {"subjects": [], "no_subjects_found": True}

    result = structured_llm_call(
        state.get("user_id"),
        SUBJECT_EXTRACTION_PROMPT.format(syllabus_text=syllabus_text),
        SubjectExtractionResult,
    )
    return {
        "subjects": result.subjects,
        "no_subjects_found": len(result.subjects) == 0,
    }
