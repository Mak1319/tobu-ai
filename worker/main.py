"""Redis -> MinIO -> Docling document worker.

This worker intentionally does not use ``tasks.py`` or Celery. MinIO writes an
object-created notification to a Redis list; this process consumes that list,
processes the source object, and publishes a completion event.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import signal
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import unquote_plus

import boto3
import redis
from botocore.client import Config
from botocore.exceptions import ClientError
from docling.document_converter import DocumentConverter
from dotenv import load_dotenv

# Prefer worker/.env, while still allowing the repository root .env to be used
# when the worker is started from the project root.
_WORKER_DIR = Path(__file__).resolve().parent
load_dotenv(_WORKER_DIR / ".env")
load_dotenv(_WORKER_DIR.parent / ".env")


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [document-worker] %(message)s",
)
log = logging.getLogger("document-worker")


REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None
REDIS_EVENT_KEY = os.getenv("REDIS_EVENT_KEY", "minio-events-queue")
STREAM_RESULT_KEY = os.getenv(
    "STREAM_RESULT_KEY",
    os.getenv("PUBSUB_RESULT_CHANNEL", "docling_results"),
)
STREAM_MAXLEN = int(os.getenv("STREAM_MAXLEN", "10000"))

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "")
MINIO_REGION = os.getenv("MINIO_REGION", "us-east-1")
DOCUMENTS_BUCKET = os.getenv("DOCUMENTS_BUCKET", "documents-bucket")
PROCESSED_BUCKET = os.getenv("PROCESSED_BUCKET", "processed-documents")


redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD,
    decode_responses=True,
    socket_connect_timeout=5,
    socket_timeout=None,
    health_check_interval=30,
)

s3 = boto3.client(
    "s3",
    endpoint_url=MINIO_ENDPOINT,
    aws_access_key_id=MINIO_ROOT_USER,
    aws_secret_access_key=MINIO_ROOT_PASSWORD,
    region_name=MINIO_REGION,
    config=Config(signature_version="s3v4"),
)

converter = DocumentConverter()
_stop_requested = False


def _stop(_signum: int, _frame: Any) -> None:
    global _stop_requested
    _stop_requested = True
    log.info("shutdown requested")


def _metadata_value(metadata: dict[str, Any], *names: str) -> str | None:
    """Find metadata despite S3/MinIO changing its key casing/prefix."""
    wanted = {name.lower().replace("-", "_") for name in names}
    for key, value in metadata.items():
        normalized = str(key).lower().replace("-", "_")
        normalized = normalized.removeprefix("x_amz_meta_")
        if normalized in wanted and value is not None:
            return str(value)
    return None


def _event_records(value: Any) -> Iterator[dict[str, Any]]:
    """Yield S3 records from MinIO namespace/access notification variants."""
    if isinstance(value, list):
        for item in value:
            yield from _event_records(item)
        return
    if not isinstance(value, dict):
        return

    records = value.get("Records")
    if isinstance(records, list):
        for record in records:
            yield from _event_records(record)
        return

    # Some MinIO Redis formats wrap events in an Event array.
    events = value.get("Event")
    if isinstance(events, list):
        for event in events:
            yield from _event_records(event)
        return

    if "s3" in value or "eventName" in value or "EventName" in value:
        yield value


def _event_uploads(payload: Any) -> Iterator[tuple[str, str | None]]:
    """Return (object key, session id) pairs for object-created notifications."""
    for record in _event_records(payload):
        event_name = str(record.get("eventName", record.get("EventName", "")))
        if event_name and not event_name.startswith("s3:ObjectCreated"):
            continue

        s3_event = record.get("s3") or {}
        obj = s3_event.get("object") or {}
        bucket_info = s3_event.get("bucket") or {}
        bucket = bucket_info.get("name") or record.get("bucket")
        if bucket and bucket != DOCUMENTS_BUCKET:
            continue

        raw_key = obj.get("key") or obj.get("Key") or record.get("Key")
        if not raw_key:
            continue
        key = unquote_plus(str(raw_key))

        event_metadata = obj.get("userMetadata") or obj.get("metadata") or {}
        session_id = _metadata_value(
            event_metadata,
            "session_id",
            "session-id",
            "chat_id",
            "chat-id",
        )
        # The upload route uses chatId as the key prefix as a safe fallback.
        if not session_id:
            session_id = key.split("/", 1)[0] if "/" in key else None
        yield key, session_id


def _download_source(key: str) -> tuple[bytes, dict[str, Any]]:
    response = s3.get_object(Bucket=DOCUMENTS_BUCKET, Key=key)
    body = response["Body"]
    try:
        return body.read(), response.get("Metadata", {})
    finally:
        body.close()


def _already_processed(md_key: str) -> bool:
    try:
        s3.head_object(Bucket=PROCESSED_BUCKET, Key=md_key)
        return True
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _convert_to_markdown(source: bytes, filename: str) -> str:
    suffix = Path(filename).suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix) as temporary_file:
        temporary_file.write(source)
        temporary_file.flush()
        result = converter.convert(temporary_file.name)
        return result.document.export_to_markdown()


def _publish(session_id: str | None, status: str, file_key: str, **extra: Any) -> None:
    payload = {
        "session_id": session_id,
        "status": status,
        "file_key": file_key,
        **extra,
    }
    entry_id = redis_client.xadd(
        STREAM_RESULT_KEY,
        {"payload": json.dumps(payload)},
        maxlen=STREAM_MAXLEN,
        approximate=True,
    )
    log.info("xadd %s id=%s on %s", payload, entry_id, STREAM_RESULT_KEY)


def process_upload(file_key: str, event_session_id: str | None) -> None:
    log.info("processing s3://%s/%s", DOCUMENTS_BUCKET, file_key)
    source, object_metadata = _download_source(file_key)
    if not source:
        _publish(event_session_id, "error", file_key, error="empty object")
        return

    session_id = event_session_id or _metadata_value(
        object_metadata,
        "session_id",
        "session-id",
        "chat_id",
        "chat-id",
    )
    doc_hash = hashlib.sha256(source).hexdigest()
    md_key = f"{doc_hash}.md"

    if _already_processed(md_key):
        log.info("already processed sha256=%s", doc_hash)
        _publish(session_id, "skipped", file_key, md_key=md_key, sha256=doc_hash)
        return

    markdown = _convert_to_markdown(source, Path(file_key).name)
    s3.put_object(
        Bucket=PROCESSED_BUCKET,
        Key=md_key,
        Body=markdown.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
    )
    _publish(
        session_id,
        "processed",
        file_key,
        md_key=md_key,
        sha256=doc_hash,
        markdown_chars=len(markdown),
    )
    log.info("uploaded s3://%s/%s", PROCESSED_BUCKET, md_key)


def run() -> None:
    log.info("listening on Redis list %s", REDIS_EVENT_KEY)
    while not _stop_requested:
        item = redis_client.blpop(REDIS_EVENT_KEY, timeout=5)
        if item is None:
            continue
        _, message = item
        try:
            payload = json.loads(message)
            uploads = list(_event_uploads(payload))
            if not uploads:
                log.warning("ignoring Redis event without an object-created record")
                continue
            for file_key, session_id in uploads:
                try:
                    process_upload(file_key, session_id)
                except Exception as exc:
                    log.exception("failed processing key=%s", file_key)
                    _publish(session_id, "error", file_key, error=str(exc))
        except json.JSONDecodeError:
            log.warning("ignoring invalid JSON from Redis list %s", REDIS_EVENT_KEY)


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    try:
        run()
    finally:
        redis_client.close()
        log.info("worker stopped")


if __name__ == "__main__":
    main()
