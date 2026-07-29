"""LangGraph checkpointer backed by MongoDB.

This is what makes the workflow resumable across the `interrupt()` calls
used for subject/topic selection and answer collection -- graph state is
persisted per `thread_id` between invocations instead of living only in
memory.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from config.settings import get_settings
from persistence.mongodb.serde import get_serde
from langgraph.checkpoint.mongodb import MongoDBSaver


@contextmanager
def get_checkpointer() -> Iterator[MongoDBSaver]:
    """Yields a MongoDB-backed checkpointer scoped to the agent's database.

    Usage:
        with get_checkpointer() as checkpointer:
            app = build_graph().compile(checkpointer=checkpointer)
    """
    settings = get_settings()
    with MongoDBSaver.from_conn_string(
        settings.mongo_uri, db_name=settings.mongo_db_name, serde=get_serde()
    ) as checkpointer:
        yield checkpointer
