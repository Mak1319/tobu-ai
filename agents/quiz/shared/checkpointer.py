"""Shared LangGraph MongoDB checkpointer for quiz agents."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from langgraph.checkpoint.mongodb import MongoDBSaver
from pymongo import MongoClient

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

MONGODB_URL = os.getenv(
    "MONGODB_URL",
    os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
)
DATABASE_NAME = os.getenv("DATABASE_NAME", os.getenv("MONGO_DB", "tobu_ai"))
CHECKPOINT_COLLECTION = os.getenv("CHECKPOINT_COLLECTION", "langgraph_checkpoints")
CHECKPOINT_WRITES_COLLECTION = os.getenv(
    "CHECKPOINT_WRITES_COLLECTION", "langgraph_checkpoint_writes"
)

_client: MongoClient | None = None
_checkpointer: MongoDBSaver | None = None


def get_checkpointer() -> MongoDBSaver:
    """Return a process-wide MongoDBSaver (sync; safe for graph.invoke workers)."""
    global _client, _checkpointer
    if _checkpointer is None:
        _client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
        _checkpointer = MongoDBSaver(
            _client,
            db_name=DATABASE_NAME,
            checkpoint_collection_name=CHECKPOINT_COLLECTION,
            writes_collection_name=CHECKPOINT_WRITES_COLLECTION,
        )
    return _checkpointer


def close_checkpointer() -> None:
    """Close the shared Mongo client used by the checkpointer."""
    global _client, _checkpointer
    if _client is not None:
        _client.close()
    _client = None
    _checkpointer = None
