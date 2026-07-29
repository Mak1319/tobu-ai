"""Per-room bookkeeping for LiveKit voice sessions.

The LiveKit agent worker maps a room (one per chat wizard) to a single
LangGraph `thread_id` so re-joining the room, restarting the worker, or
running multiple sessions for the same chat keeps state consistent.

Stored in the `livekit_sessions` collection -- see
`persistence.mongodb.models.LIVEKIT_SESSIONS_COLLECTION` for the document
shape.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from persistence.mongodb.client import get_database
from persistence.mongodb.models import LIVEKIT_SESSIONS_COLLECTION


def get_session(room_name: str) -> dict[str, Any] | None:
    db = get_database()
    doc = db[LIVEKIT_SESSIONS_COLLECTION].find_one({"room_name": room_name})
    return doc


def upsert_session(
    room_name: str,
    *,
    user_id: str | None = None,
    chat_id: str | None = None,
    thread_id: str | None = None,
    syllabus_text: str | None = None,
    object_key: str | None = None,
) -> dict[str, Any]:
    """Insert or update a room's bookkeeping.

    Only fields explicitly passed as ``not None`` overwrite the existing
    document, so callers can update just the syllabus or just the thread
    without clobbering the rest.
    """
    db = get_database()
    now = datetime.now(timezone.utc)
    update: dict[str, Any] = {"updated_at": now}
    set_on_insert: dict[str, Any] = {
        "room_name": room_name,
        "created_at": now,
    }
    for field, value in (
        ("user_id", user_id),
        ("chat_id", chat_id),
        ("thread_id", thread_id),
        ("syllabus_text", syllabus_text),
        ("object_key", object_key),
    ):
        if value is not None:
            update[field] = value

    db[LIVEKIT_SESSIONS_COLLECTION].update_one(
        {"room_name": room_name},
        {"$set": update, "$setOnInsert": set_on_insert},
        upsert=True,
    )
    doc = db[LIVEKIT_SESSIONS_COLLECTION].find_one({"room_name": room_name})
    assert doc is not None  # we just upserted it
    return doc


def clear_syllabus(room_name: str) -> None:
    """Drop cached syllabus text on a room (e.g. after a syllabus re-upload).

    The next voice turn will re-fetch from MinIO.
    """
    db = get_database()
    db[LIVEKIT_SESSIONS_COLLECTION].update_one(
        {"room_name": room_name},
        {"$set": {"syllabus_text": None, "updated_at": datetime.now(timezone.utc)}},
    )