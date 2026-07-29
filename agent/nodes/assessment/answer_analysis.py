"""Layer 9 -- Answer Analysis.

Scores every collected answer against its reference answer:
  score > 0  -> correct (closer to +1 the more complete/precise)
  score == 0 -> blank / off-topic / "I don't know"
  score < 0  -> incorrect (closer to -1 the more wrong)
"""

from __future__ import annotations

from typing import Any

from nodes._llm import structured_llm_call
from prompts import ANSWER_ANALYSIS_PROMPT
from schemas.answers import AnswerScore, RoundResult, ScoreJudgement
from state import AgentState


def analyze_answers_node(state: AgentState) -> dict[str, Any]:
    questions_by_id = {q.id: q for q in state.get("current_questions") or []}
    answers = state.get("user_answers") or []
    user_id = state.get("user_id")

    scores: list[AnswerScore] = []
    for answer in answers:
        question = questions_by_id.get(answer.question_id)
        if question is None:
            continue

        if not answer.answer_text.strip():
            scores.append(
                AnswerScore(
                    question_id=answer.question_id,
                    score=0.0,
                    rationale="No answer given.",
                )
            )
            continue

        judgement = structured_llm_call(
            user_id,
            ANSWER_ANALYSIS_PROMPT.format(
                question=question.question,
                reference_answer=question.reference_answer,
                learner_answer=answer.answer_text,
            ),
            ScoreJudgement,
        )
        scores.append(
            AnswerScore(
                question_id=answer.question_id,
                score=judgement.score,
                rationale=judgement.rationale,
            )
        )

    round_result = RoundResult(
        round_number=state.get("round_number", 1),
        topic=state.get("selected_topic") or "General",
        scores=scores,
    )

    return {"round_history": [round_result]}
