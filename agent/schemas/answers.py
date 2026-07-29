"""Layer 8/9 schemas -- Answer Asking & Answer Analysis."""

from __future__ import annotations

from pydantic import BaseModel, Field


class UserAnswer(BaseModel):
    question_id: str
    answer_text: str


class ScoreJudgement(BaseModel):
    """Raw LLM output for a single answer -- no bookkeeping fields."""

    score: float = Field(
        ...,
        ge=-1.0,
        le=1.0,
        description="-1.0 wrong .. 0.0 blank/off-topic .. +1.0 correct",
    )
    rationale: str = Field(default="")


class AnswerScore(BaseModel):
    question_id: str
    score: float = Field(..., ge=-1.0, le=1.0)
    rationale: str = Field(default="")


class RoundResult(BaseModel):
    round_number: int
    topic: str
    scores: list[AnswerScore] = Field(default_factory=list)

    @property
    def total_score(self) -> float:
        return sum(s.score for s in self.scores)

    @property
    def average_score(self) -> float:
        return self.total_score / len(self.scores) if self.scores else 0.0
