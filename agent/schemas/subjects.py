"""Layer 1/2 schemas -- Subject Extraction & Selection."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Subject(BaseModel):
    name: str = Field(..., description="Subject name as it appears in the syllabus")
    text: str = Field(
        ..., description="The slice of syllabus text belonging to this subject"
    )


class SubjectExtractionResult(BaseModel):
    subjects: list[Subject] = Field(default_factory=list)
