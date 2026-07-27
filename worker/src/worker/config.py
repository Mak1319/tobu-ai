"""Centralised, fail-fast env loading for the worker.

The worker uses the same "missing required env var -> raise at startup"
pattern as `lib/minio.ts` so that misconfiguration is caught before any
real work begins.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.parse import urlparse

log = logging.getLogger(__name__)


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set")
    return value


def _optional(name: str, default: str) -> str:
    return os.environ.get(name) or default


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw!r}") from exc


@dataclass(frozen=True)
class MinioEndpoint:
    """Parsed MINIO_ENDPOINT URL split into the pieces minio-py wants."""

    host: str
    port: int
    secure: bool

    @classmethod
    def parse(cls, raw: str) -> "MinioEndpoint":
        try:
            parsed = urlparse(raw)
        except ValueError as exc:
            raise RuntimeError(
                f"MINIO_ENDPOINT must be a full URL — got {raw!r}"
            ) from exc
        if not parsed.hostname:
            raise RuntimeError(
                f"MINIO_ENDPOINT must include a hostname — got {raw!r}"
            )
        explicit_port = parsed.port
        port = (
            explicit_port
            if explicit_port is not None
            else (443 if parsed.scheme == "https" else 9000)
        )
        return cls(host=parsed.hostname, port=port, secure=parsed.scheme == "https")


@dataclass(frozen=True)
class Settings:
    endpoint: MinioEndpoint
    minio_user: str
    minio_password: str
    source_bucket: str
    dest_bucket: str
    mongo_uri: str
    mongo_db: str
    poll_interval_sec: int
    stuck_processing_min: int
    log_level: str


def load() -> Settings:
    return Settings(
        endpoint=MinioEndpoint.parse(_require("MINIO_ENDPOINT")),
        minio_user=_require("MINIO_ROOT_USER"),
        minio_password=_require("MINIO_ROOT_PASSWORD"),
        source_bucket=_optional("MINIO_SOURCE_BUCKET", "documents-bucket"),
        dest_bucket=_optional("MINIO_DEST_BUCKET", "processed-documents"),
        mongo_uri=_require("MONGO_URI"),
        mongo_db=_optional("MONGO_DB", "tobu_ai"),
        poll_interval_sec=_int("WORKER_POLL_INTERVAL_SEC", 5),
        stuck_processing_min=_int("WORKER_STUCK_PROCESSING_MIN", 10),
        log_level=_optional("LOG_LEVEL", "INFO").upper(),
    )
