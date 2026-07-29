"""MinIO credential + endpoint resolution from environment settings."""

from __future__ import annotations

from dataclasses import dataclass

from config.settings import get_settings


@dataclass(frozen=True)
class MinioCredentials:
    endpoint: str
    access_key: str
    secret_key: str
    secure: bool
    bucket: str


def get_minio_credentials() -> MinioCredentials:
    settings = get_settings()
    return MinioCredentials(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_root_user,
        secret_key=settings.minio_root_password,
        secure=settings.minio_secure,
        bucket=settings.minio_bucket,
    )
