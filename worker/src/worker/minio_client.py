"""Thin wrapper around minio-py with the helpers the worker actually needs.

We deliberately don't wrap the full client — every helper here exists
because the pipeline needs it and the cost of having a thin "god object"
is high.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import BinaryIO

from minio import Minio
from minio.datatypes import Object

from .config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExistingProcessed:
    """A pre-existing .md keyed by content hash in the dest bucket."""

    key: str
    content_hash: str | None


def make_client(s: Settings) -> Minio:
    return Minio(
        s.endpoint.host,
        access_key=s.minio_user,
        secret_key=s.minio_password,
        secure=s.endpoint.secure,
        port=s.endpoint.port,
    )


def ensure_buckets(client: Minio, s: Settings) -> None:
    """Idempotently create source/dest buckets if absent.

    Mirrors `ensureBucket()` in `tobu-ai-ui/lib/minio.ts` — the worker can
    run against a fresh MinIO instance without needing the `minio-init`
    compose helper to have completed.
    """

    for bucket in (s.source_bucket, s.dest_bucket):
        if not client.bucket_exists(bucket):
            log.info("creating bucket", bucket=bucket)
            client.make_bucket(bucket)


def download_object(client: Minio, bucket: str, key: str) -> BinaryIO:
    """Stream an object fully into memory.

    Returns a `BytesIO`. Workers are sized for ≤10 MB files so keeping
    the whole payload is fine; if we ever raise the cap, switch this to
    stream to a tempfile.
    """

    response = client.get_object(bucket, key)
    try:
        return io.BytesIO(response.read())
    finally:
        response.close()
        response.release_conn()


def find_processed_by_hash(
    client: Minio, bucket: str, content_hash: str
) -> ExistingProcessed | None:
    """Walk the dest bucket for an object whose `x-amz-meta-content-hash` matches.

    MinIO returns user metadata on `stat_object` in `Object.metadata` as a
    case-preserving dict. We compare case-insensitively to be safe.

    Linear scan. Acceptable at the volumes we're handling. If the bucket
    ever has many thousands of `.md`s we'd want a side index, but that's
    a future concern.
    """

    listed: list[Object] = list(
        client.list_objects(bucket, prefix="", recursive=True)
    )
    for obj in listed:
        if obj.object_name is None:
            continue
        if not obj.object_name.endswith(".md"):
            continue
        try:
            stat = client.stat_object(bucket, obj.object_name)
        except Exception:
            continue
        if (stat.metadata or {}).get("content-hash", "").lower() == content_hash.lower():
            return ExistingProcessed(
                key=obj.object_name, content_hash=content_hash
            )
    return None


def upload_processed_markdown(
    client: Minio,
    bucket: str,
    key: str,
    body: bytes,
    *,
    content_hash: str,
    source_key: str,
    source_content_type: str,
) -> None:
    """Put a `.md` body in `bucket` with content-hash metadata.

    The metadata is what makes the dedup lookup fast on subsequent
    uploads of the same file.
    """

    data = io.BytesIO(body)
    client.put_object(
        bucket,
        key,
        data,
        length=len(body),
        content_type="text/markdown; charset=utf-8",
        metadata={
            "content-hash": content_hash,
            "source-key": source_key,
            "source-content-type": source_content_type,
        },
    )


def processed_key(chat_id: str, content_hash: str) -> str:
    return f"{chat_id}/{content_hash}.md"
