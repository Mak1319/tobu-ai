"""Layer 3/4/5/6 schemas -- Topic Extraction, Extension & Selection."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Topic(BaseModel):
    name: str
    text: str = Field(
        default="", description="Syllabus text this topic was derived from"
    )


class TopicExtractionResult(BaseModel):
    topics: list[Topic] = Field(default_factory=list)


class TopicExtensionResult(BaseModel):
    """LLM output for a single topic's subtopic breakdown.

    Called once per topic, so this stays flat rather than keyed by topic
    name -- the caller already knows which topic it asked about.
    """

    subtopics: list[str] = Field(default_factory=list)
