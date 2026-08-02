from pydantic import BaseModel, Field


class QuestionItem(BaseModel):
    question: str
    correct_answer: str
    topic_id: str
    difficulty: int = Field(default=1, ge=1, le=5)


class ScoreResult(BaseModel):
    score_delta: int
    is_correct: bool
    rationale: str = ""
