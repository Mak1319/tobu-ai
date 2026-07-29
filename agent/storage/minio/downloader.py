"""Download syllabus source files (or their docling-processed markdown) from MinIO."""

from __future__ import annotations

from pathlib import Path

from storage.minio.client import get_minio_client
from storage.minio.credentials import get_minio_credentials


def download_to_path(
    object_key: str, destination: Path, *, bucket: str | None = None
) -> Path:
    """Download an object to a local path, creating parent directories as needed."""
    client = get_minio_client()
    creds = get_minio_credentials()
    destination.parent.mkdir(parents=True, exist_ok=True)
    client.fget_object(bucket or creds.bucket, object_key, str(destination))
    return destination


def download_bytes(object_key: str, *, bucket: str | None = None) -> bytes:
    """Download an object straight into memory (for small syllabus text files)."""
    client = get_minio_client()
    creds = get_minio_credentials()
    response = client.get_object(bucket or creds.bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def download_text(
    object_key: str, *, bucket: str | None = None, encoding: str = "utf-8"
) -> str:
    """Convenience wrapper for downloading the docling-processed `.md` syllabus."""
    return download_bytes(object_key, bucket=bucket).decode(encoding)
