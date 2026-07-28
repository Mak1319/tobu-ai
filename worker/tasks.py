import hashlib
import json
import os

import boto3
import redis
from celery import Celery
from docling.document_converter import DocumentConverter
from dotenv import load_dotenv

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "changeme")
PUBSUB_RESULT_CHANNEL = os.getenv("PUBSUB_RESULT_CHANNEL", "docling_results")
PROCESSED_BUCKET = os.getenv("PROCESSED_BUCKET", "processed-documents")
DOCUMENTS_BUCKET = os.getenv("DOCUMENTS_BUCKET", "documents-bucket")

CELERY_BROKER_URL = os.getenv(
    "CELERY_BROKER_URL", f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/1"
)
CELERY_RESULT_BACKEND = os.getenv(
    "CELERY_RESULT_BACKEND", f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/2"
)

SEAWEED_S3_ENDPOINT = os.getenv("SEAWEED_S3_ENDPOINT", "http://seaweedfs:8333")
SEAWEED_S3_ACCESS_KEY = os.getenv("SEAWEED_S3_ACCESS_KEY", "changeme")
SEAWEED_S3_SECRET_KEY = os.getenv("SEAWEED_S3_SECRET_KEY", "changeme")

app = Celery(
    "tasks",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
)

s3 = boto3.client(
    "s3",
    endpoint_url=SEAWEED_S3_ENDPOINT,
    aws_access_key_id=SEAWEED_S3_ACCESS_KEY,
    aws_secret_access_key=SEAWEED_S3_SECRET_KEY,
)

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD,
)

converter = DocumentConverter()


def _publish(session_id: str, status: str, file_key: str) -> None:
    redis_client.publish(
        PUBSUB_RESULT_CHANNEL,
        json.dumps({"session_id": session_id, "status": status, "file_key": file_key}),
    )


@app.task(name="tasks.process_document")
def process_document(file_key: str, session_id: str) -> None:
    obj = s3.get_object(Bucket=PROCESSED_BUCKET, Key=file_key)
    if obj.get("Body"):
        _publish(session_id, "skipped", file_key)
        return

    with s3.get_object(Bucket=DOCUMENTS_BUCKET, Key=file_key)["Body"] as f:
        source = f.read()

    doc_hash = hashlib.sha256(source).hexdigest()
    md_key = f"{doc_hash}.md"

    try:
        s3.head_object(Bucket=PROCESSED_BUCKET, Key=md_key)
        _publish(session_id, "skipped", file_key)
        return
    except s3.exceptions.ClientError:
        pass

    markdown = converter.convert_bytes(source).document.export_to_markdown()

    s3.put_object(Bucket=PROCESSED_BUCKET, Key=md_key, Body=markdown.encode())

    _publish(session_id, "processed", file_key)
