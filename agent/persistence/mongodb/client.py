"""Shared, process-wide MongoDB client for the agent.

Mirrors the caching pattern used by `tobu-ai-ui/lib/db/connection.ts` so we
don't open a new connection per request/node invocation.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from pymongo import MongoClient
from pymongo.database import Database

from config.settings import get_settings


@lru_cache(maxsize=1)
def get_mongo_client() -> MongoClient[Any]:
    settings = get_settings()
    return MongoClient(settings.mongo_uri)


def get_database() -> Database[Any]:
    settings = get_settings()
    return get_mongo_client()[settings.mongo_db_name]
