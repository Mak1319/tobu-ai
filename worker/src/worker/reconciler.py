"""Startup + reconnect reconciliation.

MinIO's bucket notifications are best-effort — events can be missed
across container restarts, network blips, or short outages. We sweep
Mongo on startup and after every reconnect, picking up:

  * rows still in `pending` (never processed)
  * rows stuck in `processing` past `stuck_after_minutes` (worker
    crashed mid-docling)

For each, we reset `processing` → `pending` and run the same pipeline
the listener would have. Single-flight so a flood of uploads on
startup doesn't pin the worker.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

from pymongo.collection import Collection

from . import store

log = logging.getLogger(__name__)


ProcessOne = Callable[[store.UploadRecord], Awaitable[None]]


async def run_once(
    col: Collection,
    *,
    process_one: ProcessOne,
    stuck_after_minutes: int,
) -> int:
    """Process all pending/stuck rows once. Returns the count handled."""

    rows = store.list_pending_or_stuck(col, stuck_after_minutes=stuck_after_minutes)
    if not rows:
        return 0
    log.info("reconciler found rows", count=len(rows))
    handled = 0
    for row in rows:
        # Reclaim stuck `processing` rows back to `pending` so
        # `process_one` can claim them with the same atomic transition
        # the live listener uses.
        store.reset_to_pending(col, row.mongo_id)
        try:
            await process_one(row)
            handled += 1
        except Exception:
            log.exception(
                "reconciler failed to process row",
                key=row.key,
            )
    return handled