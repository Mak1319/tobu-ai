"""Shared LangGraph state for the syllabus -> adaptive-quiz workflow.

Every node receives the full state and returns a partial dict of updates
(standard LangGraph node contract). `round_history` accumulates across the
progressive-question loop via an `operator.add` reducer; everything else is
last-write-wins.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from schemas.answers import RoundResult, UserAnswer
from schemas.graph import TopicGraph
from schemas.questions import QuestionAnswer
from schemas.subjects import Subject
from schemas.topics import Topic


class AgentState(TypedDict, total=False):
    # --- identity / runtime wiring ---
    user_id: str
    thread_id: str

    # --- Layer 1/2: subjects ---
    syllabus_text: str
    subjects: list[Subject]
    selected_subject: Subject | None
    no_subjects_found: bool

    # --- Layer 3/4/5/6: topics ---
    topics: list[Topic]
    subtopics_by_topic: dict[str, list[str]]
    selected_topic: str | None
    topic_graph: TopicGraph | None

    # --- Layer 7/8: questions & answers (current round) ---
    round_number: int
    current_questions: list[QuestionAnswer]
    user_answers: list[UserAnswer]

    # --- Layer 9/10: scoring & progression ---
    round_history: Annotated[list[RoundResult], operator.add]
    continue_session: bool

    # --- final output ---
    summary: dict[str, Any]

    # --- misc ---
    error: str | None
