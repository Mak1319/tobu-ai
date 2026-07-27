"""Worker entrypoint.

Wires together:

  * config         — env loading
  * minio_client   — MinIO client + helpers
  * store          — Mongo `UploadedFile` access
  * hasher         — streaming SHA-256
  * processor      — Docling → markdown
  * reconciler     — startup + reconnect sweep
  * listener       — MinIO bucket-event subscription with reconnect

The full pipeline for one upload:

  1. event arrives (live or via reconciler)
  2. claim row (pending → processing)
  3. download object from source bucket
  4. compute SHA-256 of the bytes
  5. look up by hash in dest bucket:
       HIT  → just mark ready with the existing key
       MISS → run Docling → upload .md to dest → mark ready
  6. on any error → mark failed with the message

We keep the pipeline async; the blocking MinIO / Mongo / Docling calls
run via `asyncio.to_thread` so the event loop stays responsive to
SIGTERM.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
from typing import Any

import structlog

from . import (
    config,
    listener as listener_mod,
    minio_client,
    processor,
    reconciler,
    store,
)
from .hasher import hash_stream

log = logging.getLogger(__name__)


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level)),
    )


def _per_row_logger(row: store.UploadRecord) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger().bind(
        key=row.key, chat_id=row.chat_id, filename=row.filename
    )


async def process_one(
    row: store.UploadRecord,
    *,
    minio: Any,
    s: config.Settings,
    col: Any,
) -> None:
    """Run the full pipeline for a single upload.

    Errors are caught and persisted as `processingStatus: "failed"` so a
    bad PDF doesn't kill the worker; the listener keeps running.
    """

    slog = _per_row_logger(row)

    # 1. atomic claim.
    if not store.claim(col, row.mongo_id):
        slog.info("row already claimed; skipping")
        return

    try:
        # 2. download.
        payload_buf = await asyncio.to_thread(
            minio_client.download_object, minio, row.bucket, row.key
        )

        # 3. hash.
        content_hash, payload_bytes = await asyncio.to_thread(
            hash_stream, payload_buf
        )
        slog.info("hashed", content_hash=content_hash, size=len(payload_bytes))

        # 4. dedup lookup.
        existing = await asyncio.to_thread(
            minio_client.find_processed_by_hash,
            minio,
            s.dest_bucket,
            content_hash,
        )

        if existing is not None:
            slog.info("cache hit; skipping docling", existing_key=existing.key)
            await asyncio.to_thread(
                store.mark_ready,
                col,
                row.mongo_id,
                content_hash=content_hash,
                processed_key=existing.key,
            )
            return

        # 5. miss → docling.
        markdown = await asyncio.to_thread(
            processor.convert_bytes_to_markdown,
            payload_bytes,
            source_filename=row.filename,
        )
        processed_key = minio_client.processed_key(row.chat_id, content_hash)
        await asyncio.to_thread(
            minio_client.upload_processed_markdown,
            minio,
            s.dest_bucket,
            processed_key,
            markdown.encode("utf-8"),
            content_hash=content_hash,
            source_key=row.key,
            source_content_type=row.content_type,
        )
        slog.info("uploaded processed markdown", processed_key=processed_key)

        # 6. mark ready.
        await asyncio.to_thread(
            store.mark_ready,
            col,
            row.mongo_id,
            content_hash=content_hash,
            processed_key=processed_key,
        )
    except Exception as exc:
        slog.exception("processing failed")
        await asyncio.to_thread(
            store.mark_failed, col, row.mongo_id, str(exc)
        )


async def on_event(
    bucket: str,
    key: str,
    *,
    minio: Any,
    s: config.Settings,
    col: Any,
) -> None:
    """Listener handler — load the Mongo row and dispatch to the pipeline."""

    row = await asyncio.to_thread(store.find_by_key, col, key)
    if row is None:
        log.warning("event for unknown key; skipping", bucket=bucket, key=key)
        return
    if row.bucket != bucket:
        log.warning(
            "event bucket mismatch; skipping",
            expected=row.bucket,
            got=bucket,
            key=key,
        )
        return
    await process_one(row, minio=minio, s=s, col=col)


async def reconciler_loop(
    *,
    minio: Any,
    s: config.Settings,
    col: Any,
    stop: asyncio.Event,
) -> None:
    """Run `reconciler.run_once` every `poll_interval_sec`."""

    interval = s.poll_interval_sec
    while not stop.is_set():
        try:
            handled = await reconciler.run_once(
                col,
                process_one=lambda r: process_one(r, minio=minio, s=s, col=col),
                stuck_after_minutes=s.stuck_processing_min,
            )
            if handled:
                log.info("reconciler handled rows", handled=handled)
        except Exception:
            log.exception("reconciler crashed; will retry next interval")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass


async def amain() -> int:
    s = config.load()
    _configure_logging(s.log_level)
    log.info("worker starting", config=vars(s))

    minio = await asyncio.to_thread(minio_client.make_client, s)
    await asyncio.to_thread(minio_client.ensure_buckets, minio, s)

    mongo_client, col = await asyncio.to_thread(
        store.make_collection, s.mongo_uri, s.mongo_db
    )
    # Force a real connection so we fail fast on bad URI.
    await asyncio.to_thread(mongo_client.admin.command, "ping")

    stop = asyncio.Event()

    def _request_shutdown(*_: Any) -> None:
        log.info("shutdown signal received")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _request_shutdown)

    # Run an initial sweep so we don't depend on the listener firing
    # for events that happened while we were down.
    await reconciler.run_once(
        col,
        process_one=lambda r: process_one(r, minio=minio, s=s, col=col),
        stuck_after_minutes=s.stuck_processing_min,
    )

    listener_task = asyncio.create_task(
        listener_mod.run(
            minio,
            bucket=s.source_bucket,
            events=["s3:ObjectCreated:Put", "s3:ObjectCreated:CompleteMultipartUpload"],
            handler=lambda b, k: on_event(b, k, minio=minio, s=s, col=col),
            stop=stop,
        ),
        name="bucket-listener",
    )
    reconciler_task = asyncio.create_task(
        reconciler_loop(minio=minio, s=s, col=col, stop=stop),
        name="reconciler",
    )

    await stop.wait()
    log.info("stopping tasks")
    listener_task.cancel()
    reconciler_task.cancel()
    for t in (listener_task, reconciler_task):
        try:
            await t
        except asyncio.CancelledError:
            pass
    log.info("worker stopped")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(amain()))


if __name__ == "__main__":
    main()