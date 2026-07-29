"""Custom LangGraph checkpoint serializer allowlist.

LangGraph's default `JsonPlusSerializer` will (de)serialize arbitrary
pydantic models found in graph state, but warns that doing so implicitly
will be blocked in a future version unless the types are explicitly
allow-listed (see the `LANGGRAPH_STRICT_MSGPACK` env var). Registering every
pydantic model that actually appears in `AgentState` here keeps checkpoint
round-tripping working today without relying on the permissive default.
"""

from __future__ import annotations

from schemas.answers import AnswerScore, RoundResult, UserAnswer
from schemas.graph import TopicGraph, TopicGraphEdge, TopicGraphNode
from schemas.questions import QuestionAnswer
from schemas.subjects import Subject
from schemas.topics import Topic
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

_STATE_MODELS = (
    Subject,
    Topic,
    TopicGraph,
    TopicGraphNode,
    TopicGraphEdge,
    QuestionAnswer,
    UserAnswer,
    AnswerScore,
    RoundResult,
)

ALLOWED_MSGPACK_MODULES: list[tuple[str, str]] = [
    (cls.__module__, cls.__qualname__) for cls in _STATE_MODELS
]


def get_serde() -> JsonPlusSerializer:
    """A `JsonPlusSerializer` that only trusts this project's own schema
    types plus msgpack's built-in safe types -- not arbitrary pickled
    objects from the checkpoint store.
    """
    return JsonPlusSerializer(allowed_msgpack_modules=ALLOWED_MSGPACK_MODULES)
