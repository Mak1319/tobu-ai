"""Mongo access for `UploadedFile`.

Kept narrow on purpose: only the transitions the worker actually needs.
The Next.js side owns schema definition; the worker writes rows it
believes should exist (created by the upload route) and updates
processing fields.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import MongoClient
from pymongo.collection import Collection

log = logging.getLogger(__name__)


@dataclass
class UploadRecord:
    """The fields the worker reads off an `UploadedFile` row."""

    mongo_id: Any
    chat_id: str
    bucket: str
    key: str
    filename: str
    content_type: str


def make_collection(uri: str, db_name: str) -> tuple[MongoClient, Collection]:
    client = MongoClient(uri, serverSelectionTimeoutMS=5_000)
    return client, client[db_name]["uploadedfiles"]


def find_by_key(col: Collection, key: str) -> UploadRecord | None:
    doc = col.find_one({"key": key})
    if not doc:
        return None
    return UploadRecord(
        mongo_id=doc["_id"],
        chat_id=doc["chatId"],
        bucket=doc["bucket"],
        key=doc["key"],
        filename=doc.get("filename", ""),
        content_type=doc.get("contentType", ""),
    )


def list_pending_or_stuck(
    col: Collection, *, stuck_after_minutes: int
) -> list[UploadRecord]:
    """Find rows the worker hasn't successfully processed yet.

    Rows in `processing` for longer than `stuck_after_minutes` are
    reclaimed (treated as failed-by-crash) so a single bad conversion
    can't poison the whole pipeline.

    Pending rows are always included; the first condition wins.
    """

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=stuck_after_minutes)
    docs = col.find(
        {
            "$or": [
                {"processingStatus": "pending"},
                {
                    "processingStatus": "processing",
                    "updatedAt": {"$lt": cutoff},
                },
            ]
        },
        sort=[("uploadedAt", 1)],
    )
    out: list[UploadRecord] = []
    for doc in docs:
        out.append(
            UploadRecord(
                mongo_id=doc["_id"],
                chat_id=doc["chatId"],
                bucket=doc["bucket"],
                key=doc["key"],
                filename=doc.get("filename", ""),
                content_type=doc.get("contentType", ""),
            )
        )
    return out


def claim(col: Collection, mongo_id: Any) -> bool:
    """Atomic `pending` → `processing`. Returns True if we won the race."""

    res = col.update_one(
        {"_id": mongo_id, "processingStatus": "pending"},
        {"$set": {"processingStatus": "processing"}},
    )
    return res.modified_count == 1


def mark_ready(
    col: Collection,
    mongo_id: Any,
    *,
    content_hash: str,
    processed_key: str,
) -> None:
    col.update_one(
        {"_id": mongo_id},
        {
            "$set": {
                "processingStatus": "ready",
                "processedAt": datetime.now(timezone.utc),
                "processedKey": processed_key,
                "contentHash": content_hash,
                "processingError": None,
            }
        },
    )


def mark_failed(col: Collection, mongo_id: Any, error: str) -> None:
    col.update_one(
        {"_id": mongo_id},
        {
            "$set": {
                "processingStatus": "failed",
                "processingError": error[:2000],  # cap to avoid pathological blobs
            }
        },
    )


def reset_to_pending(col: Collection, mongo_id: Any) -> None:
    """Used by the reconciler on rows we suspect were stuck before a crash."""

    col.update_one(
        {"_id": mongo_id, "processingStatus": "processing"},
        {"$set": {"processingStatus": "pending"}},
    )
