"""Layer 8 -- Answer Asking.

Pauses once per question, collecting the learner's free-text answer via
`interrupt()`. LangGraph replays this node from the top on every resume, and
each `interrupt()` call consumes the next queued resume value in order --
the standard "multiple interrupts per node" pattern -- so previously
answered questions are served straight from the resume-value cache instead
of re-prompting.
"""

from __future__ import annotations

from langgraph.types import interrupt

from schemas.answers import UserAnswer
from state import AgentState


def ask_answers_node(state: AgentState) -> dict[str, list[UserAnswer]]:
    questions = state.get("current_questions") or []
    answers: list[UserAnswer] = []

    for question in questions:
        answer_text = interrupt(
            {
                "type": "answer_question",
                "question_id": question.id,
                "question": question.question,
                "topic": question.topic,
            }
        )
        answers.append(
            UserAnswer(question_id=question.id, answer_text=str(answer_text))
        )

    return {"user_answers": answers}
