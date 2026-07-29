"""Layer 7/10 schemas -- Question Generation.

`GeneratedQAPair`/`GeneratedQuestionSet` are what we ask the LLM to produce
(no id/topic bookkeeping). `QuestionAnswer` is the fully-hydrated version
used everywhere else in the graph state, with a stable id attached after
generation so it survives round-trips through the checkpointer.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class GeneratedQAPair(BaseModel):
    question: str
    reference_answer: str
    difficulty: str = Field(default="medium", description="easy | medium | hard")


class GeneratedQuestionSet(BaseModel):
    items: list[GeneratedQAPair] = Field(default_factory=list)


class QuestionAnswer(BaseModel):
    id: str
    topic: str
    question: str
    reference_answer: str
    difficulty: str = Field(default="medium")
