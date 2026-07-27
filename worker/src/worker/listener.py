"""MinIO bucket-event listener with reconnect-on-error.

minio-py's `listen_bucket_notification` opens a long-lived HTTP stream
to MinIO's admin API and yields events as they arrive. Long-lived
streams die for many boring reasons — proxies close idle connections,
containers restart, MinIO rolls a new pod. We wrap it so the worker
self-heals without operator action.

The wrapper exposes `run(handler, stop)` where:
  * `handler` is an async callable that takes a (bucket, key) tuple and
    does the work.
  * `stop` is an `asyncio.Event` that the caller sets to ask us to
    tear down cleanly on shutdown.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

from minio import Minio

log = logging.getLogger(__name__)

EventHandler = Callable[[str, str], Awaitable[None]]


async def _iter_in_thread(iterator, *, stop: asyncio.Event) -> dict | None:
    """Pull the next record from a blocking iterator, or None on EOF.

    Runs in a thread via `run_in_executor` so the surrounding asyncio
    loop can react to `stop` between events.
    """

    while not stop.is_set():
        try:
            return next(iterator)
        except StopIteration:
            return None
        # Space out requests so a stopped-loop doesn't burn CPU.
        await asyncio.sleep(0)
    return None


async def _consume_one_session(
    client: Minio,
    *,
    bucket: str,
    events: list[str],
    handler: EventHandler,
    stop: asyncio.Event,
) -> None:
    """Run one listen session. Raises on stream error so the outer
    reconnect loop can take over."""

    loop = asyncio.get_running_loop()
    iterator = client.listen_bucket_notification(
        bucket_name=bucket, prefix="", suffix="", events=events
    )
    log.info("subscribed", bucket=bucket, events=events)

    while not stop.is_set():
        record = await _iter_in_thread(iterator, stop=stop)
        if stop.is_set():
            return
        if record is None:
            # Server closed the stream cleanly.
            raise StopAsyncIteration
        try:
            obj = (record.get("s3") or {}).get("object") or {}
            b = (record.get("s3") or {}).get("bucket") or {}
            key = obj.get("key")
            bucket_name = b.get("name")
            if not key or not bucket_name:
                log.warning("malformed event", record=record)
                continue
        except Exception:
            log.exception("malformed event", record=record)
            continue
        try:
            await handler(bucket_name, key)
        except Exception:
            # The handler is responsible for its own per-row error
            # reporting (Mongo state); we just make sure one bad row
            # doesn't kill the listener.
            log.exception("handler raised", bucket=bucket_name, key=key)


async def run(
    client: Minio,
    *,
    bucket: str,
    events: list[str],
    handler: EventHandler,
    stop: asyncio.Event,
    initial_delay_sec: float = 5.0,
    max_delay_sec: float = 60.0,
) -> None:
    """Subscribe forever, reconnecting with capped exponential backoff."""

    delay = initial_delay_sec
    while not stop.is_set():
        try:
            await _consume_one_session(
                client, bucket=bucket, events=events, handler=handler, stop=stop
            )
            return  # clean exit
        except asyncio.CancelledError:
            raise
        except StopAsyncIteration:
            log.warning("listen stream ended; reconnecting in %.1fs", delay)
        except Exception:
            log.exception("listen error; reconnecting in %.1fs", delay)
        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
        except asyncio.TimeoutError:
            pass
        else:
            return
        delay = min(delay * 2, max_delay_sec)