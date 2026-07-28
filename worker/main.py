"""Bridge: consume MinIO upload events from a Redis list and enqueue Celery jobs.

MinIO is configured (see docker-compose) to RPUSH object-created events onto
``REDIS_EVENT_KEY``. This process BLPOP's that list, extracts the object key
(and optional session/chat id), and dispatches ``tasks.process_document``.

Completion status is published by the Celery worker via Redis pub/sub
(``PUBSUB_RESULT_CHANNEL``) — this bridge only handles the intake side.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
from typing import Any

import redis
from dotenv import load_dotenv

from tasks import process_document

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [bridge] %(message)s",
)
log = logging.getLogger("bridge")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
# List key MinIO RPUSHes into (must match MINIO_NOTIFY_REDIS_KEY_primary).
REDIS_EVENT_KEY = os.getenv("REDIS_EVENT_KEY", "minio-events-queue")
DOCUMENTS_BUCKET = os.getenv("DOCUMENTS_BUCKET", "documents-bucket")
BLPOP_TIMEOUT = int(os.getenv("BLPOP_TIMEOUT", "5"))

r = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD or None,
    decode_responses=True,
)


def _parse_event(raw: str | bytes) -> dict[str, Any] | None:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        event = json.loads(raw)
    except (ValueError, TypeError):
        log.warning("skip non-JSON payload: %r", raw[:200])
        return None
    if not isinstance(event, dict):
        return None
    return event


def _object_key_from_event(event: dict[str, Any]) -> str | None:
    """Extract the S3 object key from a MinIO Redis notification.

    Namespace-format events look like::

        {
          "EventName": "s3:ObjectCreated:Put",
          "Key": "documents-bucket/chatId/123-file.pdf",
          "Records": [{ "s3": { "bucket": {"name": "..."}, "object": {"key": "..."} } }]
        }
    """
    records = event.get("Records") or []
    if records:
        s3info = (records[0] or {}).get("s3") or {}
        bucket = ((s3info.get("bucket") or {}).get("name")) or ""
        key = (s3info.get("object") or {}).get("key") or ""
        if key:
            # Keys are often URL-encoded in S3 event records.
            key = urllib.parse.unquote(key)
            if bucket and bucket != DOCUMENTS_BUCKET:
                log.debug("ignore event for bucket %s", bucket)
                return None
            return key.lstrip("/")

    # Fallback: top-level "Key" is "bucket/object/path".
    top = event.get("Key") or event.get("key")
    if isinstance(top, str) and top:
        top = urllib.parse.unquote(top)
        prefix = f"{DOCUMENTS_BUCKET}/"
        if top.startswith(prefix):
            return top[len(prefix) :]
        # Already an object key without bucket prefix.
        if "/" in top and not top.startswith(DOCUMENTS_BUCKET):
            return top.lstrip("/")
        if top.startswith(DOCUMENTS_BUCKET + "/"):
            return top.split("/", 1)[1]
    return None


def _session_id_from_event(event: dict[str, Any], file_key: str) -> str:
    """Resolve a correlation id for result pub/sub.

    Preference order:
    1. userMetadata on the S3 object (session_id / session-id / chatId)
    2. first path segment of the object key (UI uploads as ``{chatId}/...``)
    3. the full file key
    """
    records = event.get("Records") or []
    if records:
        obj = ((records[0] or {}).get("s3") or {}).get("object") or {}
        meta = obj.get("userMetadata") or obj.get("UserMetadata") or {}
        if isinstance(meta, dict):
            # MinIO lowercases and may prefix with "x-amz-meta-".
            normalized = {
                str(k).lower().removeprefix("x-amz-meta-"): v for k, v in meta.items()
            }
            for candidate in (
                "session_id",
                "session-id",
                "sessionid",
                "chatid",
                "chat_id",
            ):
                if normalized.get(candidate):
                    return str(normalized[candidate])

    # UI keys are ``{chatId}/{timestamp}-{filename}``.
    if "/" in file_key:
        return file_key.split("/", 1)[0]
    return file_key


def _is_object_created(event: dict[str, Any]) -> bool:
    name = str(event.get("EventName") or event.get("eventName") or "")
    if name:
        return "ObjectCreated" in name
    # If the field is missing, still try to process (defensive).
    return True


def run() -> None:
    log.info(
        "listening on redis list %r at %s:%s/%s",
        REDIS_EVENT_KEY,
        REDIS_HOST,
        REDIS_PORT,
        REDIS_DB,
    )
    while True:
        item = r.blpop(REDIS_EVENT_KEY, timeout=BLPOP_TIMEOUT)
        if item is None:
            continue

        _list_name, raw = item
        event = _parse_event(raw)
        if event is None:
            continue

        if not _is_object_created(event):
            log.debug("ignore non-create event: %s", event.get("EventName"))
            continue

        file_key = _object_key_from_event(event)
        if not file_key:
            log.warning("could not extract object key from event: %s", event)
            continue

        # Skip zero-length / directory marker style keys.
        if file_key.endswith("/"):
            continue

        session_id = _session_id_from_event(event, file_key)
        log.info("enqueue process_document key=%s session_id=%s", file_key, session_id)
        process_document.delay(file_key, session_id)  # type: ignore[attr-defined]


if __name__ == "__main__":
    run()
