"""Input schema for the very first node in the workflow."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SyllabusInput(BaseModel):
    """Raw syllabus text supplied by the caller.

    Text is typically produced upstream by the docling worker from an
    uploaded PDF/image (see `tobu-ai-ui`'s MinIO upload flow), or pasted
    directly by the caller.
    """

    text: str = Field(..., min_length=1, description="Full syllabus text")
    source_key: str | None = Field(
        default=None,
        description="Optional MinIO object key the text was extracted from",
    )
