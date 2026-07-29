"""Cached MinIO client, mirroring `tobu-ai-ui/lib/minio.ts`'s singleton pattern."""

from __future__ import annotations

from functools import lru_cache

from storage.minio.credentials import get_minio_credentials

from minio import Minio


@lru_cache
def get_minio_client() -> Minio:
    creds = get_minio_credentials()
    return Minio(
        creds.endpoint,
        access_key=creds.access_key,
        secret_key=creds.secret_key,
        secure=creds.secure,
    )
