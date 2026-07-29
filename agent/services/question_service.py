"""Shared question-generation logic used by both the first round
(`nodes.question.generation`) and every subsequent adaptive round
(`nodes.assessment.progressive_questions`).
"""

from __future__ import annotations

from uuid import uuid4

from nodes._llm import structured_llm_call
from prompts import QUESTION_GENERATION_PROMPT
from schemas.questions import GeneratedQuestionSet, QuestionAnswer

QUESTIONS_PER_ROUND = 10


def generate_question_set(user_id: str | None, topic_name: str) -> list[QuestionAnswer]:
    generated = structured_llm_call(
        user_id,
        QUESTION_GENERATION_PROMPT.format(
            count=QUESTIONS_PER_ROUND, topic_name=topic_name, topic_text=topic_name
        ),
        GeneratedQuestionSet,
    )
    return [
        QuestionAnswer(
            id=str(uuid4()),
            topic=topic_name,
            question=pair.question,
            reference_answer=pair.reference_answer,
            difficulty=pair.difficulty,
        )
        for pair in generated.items[:QUESTIONS_PER_ROUND]
    ]
