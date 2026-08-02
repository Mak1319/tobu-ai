"""Celery tasks: download from MinIO, run docling, publish result on Redis pub/sub."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from urllib.parse import quote

import boto3
import redis
from botocore.client import Config
from botocore.exceptions import ClientError
from celery import Celery
from docling.document_converter import DocumentConverter
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [worker] %(message)s",
)
log = logging.getLogger("worker")

# ---------------------------------------------------------------------------
# Redis / Celery
# ---------------------------------------------------------------------------
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
STREAM_RESULT_KEY = os.getenv(
    "STREAM_RESULT_KEY",
    os.getenv("PUBSUB_RESULT_CHANNEL", "docling_result"),
)
STREAM_MAXLEN = int(os.getenv("STREAM_MAXLEN", "10000"))


def _redis_url(db: int) -> str:
    """Build a redis:// URL, percent-encoding the password if present."""
    if REDIS_PASSWORD:
        return (
            f"redis://:{quote(REDIS_PASSWORD, safe='')}@{REDIS_HOST}:{REDIS_PORT}/{db}"
        )
    return f"redis://{REDIS_HOST}:{REDIS_PORT}/{db}"


CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", _redis_url(1))
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", _redis_url(2))
CELERY_QUEUE = os.getenv("CELERY_QUEUE", "docling")

# ---------------------------------------------------------------------------
# MinIO (S3-compatible)
# ---------------------------------------------------------------------------
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "")
MINIO_REGION = os.getenv("MINIO_REGION", "us-east-1")

DOCUMENTS_BUCKET = os.getenv("DOCUMENTS_BUCKET", "documents-bucket")
PROCESSED_BUCKET = os.getenv("PROCESSED_BUCKET", "processed-documents")

app = Celery(
    "tasks",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
)
app.conf.task_default_queue = CELERY_QUEUE
app.conf.task_routes = {"tasks.process_document": {"queue": CELERY_QUEUE}}

s3 = boto3.client(
    "s3",
    endpoint_url=MINIO_ENDPOINT,
    aws_access_key_id=MINIO_ROOT_USER,
    aws_secret_access_key=MINIO_ROOT_PASSWORD,
    region_name=MINIO_REGION,
    config=Config(signature_version="s3v4"),
)

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD or None,
    decode_responses=True,
)

converter = DocumentConverter()


def _publish(session_id: str, status: str, file_key: str, **extra: object) -> None:
    """Append a completion event to the docling results stream."""
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


def _already_processed(md_key: str) -> bool:
    try:
        s3.head_object(Bucket=PROCESSED_BUCKET, Key=md_key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def _download_bytes(bucket: str, key: str) -> bytes:
    obj = s3.get_object(Bucket=bucket, Key=key)
    body = obj["Body"]
    try:
        return body.read()
    finally:
        body.close()


def _convert_to_markdown(source: bytes, filename: str) -> str:
    """Run docling on in-memory bytes via a temp file (reliable for PDF/images)."""
    suffix = Path(filename).suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(source)
        tmp.flush()
        result = converter.convert(tmp.name)
        return result.document.export_to_markdown()


@app.task(name="tasks.process_document", bind=True, max_retries=3)
def process_document(self, file_key: str, session_id: str) -> dict:
    log.info("process_document key=%s session_id=%s", file_key, session_id)

    try:
        source = _download_bytes(DOCUMENTS_BUCKET, file_key)
    except ClientError as exc:
        log.exception("failed to download s3://%s/%s", DOCUMENTS_BUCKET, file_key)
        _publish(session_id, "error", file_key, error=str(exc))
        raise

    if not source:
        _publish(session_id, "error", file_key, error="empty object")
        return {"status": "error", "file_key": file_key, "error": "empty object"}

    doc_hash = hashlib.sha256(source).hexdigest()
    md_key = f"{doc_hash}.md"

    if _already_processed(md_key):
        log.info("skip already processed hash=%s key=%s", doc_hash, file_key)
        _publish(session_id, "skipped", file_key, md_key=md_key, sha256=doc_hash)
        return {
            "status": "skipped",
            "file_key": file_key,
            "md_key": md_key,
            "sha256": doc_hash,
        }

    try:
        filename = file_key.rsplit("/", 1)[-1]
        markdown = _convert_to_markdown(source, filename)
        s3.put_object(
            Bucket=PROCESSED_BUCKET,
            Key=md_key,
            Body=markdown.encode("utf-8"),
            ContentType="text/markdown; charset=utf-8",
        )
    except Exception as exc:
        log.exception("docling failed for key=%s", file_key)
        _publish(session_id, "error", file_key, error=str(exc))
        # Retry transient failures a few times.
        raise self.retry(exc=exc, countdown=30) from exc

    log.info("processed key=%s -> s3://%s/%s", file_key, PROCESSED_BUCKET, md_key)
    _publish(
        session_id,
        "processed",
        file_key,
        md_key=md_key,
        sha256=doc_hash,
        markdown_chars=len(markdown),
    )
    return {
        "status": "processed",
        "file_key": file_key,
        "md_key": md_key,
        "sha256": doc_hash,
        "markdown_chars": len(markdown),
    }
