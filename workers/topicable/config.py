"""Runtime configuration. CLI args override environment variables."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_WORKER_DIR = Path(__file__).resolve().parent
load_dotenv(_WORKER_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    redis_host: str
    redis_port: int
    redis_db: int
    redis_password: str | None
    redis_event_list: str
    redis_output_stream: str
    stream_maxlen: int
    block_seconds: int

    mongodb_url: str
    mongodb_db: str
    hash_collection: str

    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_region: str
    uploaded_bucket: str
    processed_bucket: str

    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_timeout: float

    force_docling: bool
    log_level: str


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def build_settings(argv: list[str] | None = None) -> Settings:
    parser = argparse.ArgumentParser(description="topicable document + topic-graph worker")
    parser.add_argument("--redis-host", default=_env("REDIS_HOST", "localhost"))
    parser.add_argument("--redis-port", type=int, default=int(_env("REDIS_PORT", "6379")))
    parser.add_argument("--redis-db", type=int, default=int(_env("REDIS_DB", "0")))
    parser.add_argument("--redis-password", default=_env("REDIS_PASSWORD") or None)
    parser.add_argument(
        "--redis-event-list",
        default=_env(
            "REDIS_EVENT_LIST",
            _env("REDIS_INPUT_STREAM", "minio-events"),
        ),
        help="Redis list MinIO RPUSHes into (consumed with BLPOP)",
    )
    parser.add_argument(
        "--redis-output-stream",
        default=_env("REDIS_OUTPUT_STREAM", "docling_result"),
    )
    parser.add_argument(
        "--stream-maxlen",
        type=int,
        default=int(_env("STREAM_MAXLEN", "10000")),
    )
    parser.add_argument(
        "--block-seconds",
        type=int,
        default=int(
            _env(
                "REDIS_BLOCK_SECONDS",
                str(max(1, int(_env("REDIS_BLOCK_MS", "5000")) // 1000)),
            )
        ),
        help="BLPOP timeout in seconds",
    )
    parser.add_argument(
        "--mongodb-url",
        default=_env("MONGODB_URL", "mongodb://localhost:27017"),
    )
    parser.add_argument(
        "--mongodb-db",
        default=_env("MONGODB_DB", "tobu_ai"),
    )
    parser.add_argument(
        "--hash-collection",
        default=_env("HASH_COLLECTION", "hashContentMap"),
    )
    parser.add_argument(
        "--minio-endpoint",
        default=_env("MINIO_ENDPOINT", "http://localhost:9000"),
    )
    parser.add_argument(
        "--minio-access-key",
        default=_env("MINIO_ACCESS_KEY", _env("MINIO_ROOT_USER", "minioadmin")),
    )
    parser.add_argument(
        "--minio-secret-key",
        default=_env("MINIO_SECRET_KEY", _env("MINIO_ROOT_PASSWORD", "")),
    )
    parser.add_argument("--minio-region", default=_env("MINIO_REGION", "us-east-1"))
    parser.add_argument(
        "--uploaded-bucket",
        default=_env("UPLOADED_BUCKET", "uploaded-documents"),
    )
    parser.add_argument(
        "--processed-bucket",
        default=_env("PROCESSED_BUCKET", "processed-documents"),
    )
    parser.add_argument(
        "--llm-base-url",
        default=_env("LLM_BASE_URL", "http://localhost:11434/v1"),
    )
    parser.add_argument("--llm-api-key", default=_env("LLM_API_KEY", "ollama"))
    parser.add_argument("--llm-model", default=_env("LLM_MODEL", "llama3.2"))
    parser.add_argument(
        "--llm-timeout",
        type=float,
        default=float(_env("LLM_TIMEOUT", "180")),
    )
    parser.add_argument("--log-level", default=_env("LOG_LEVEL", "INFO"))
    parser.add_argument(
        "--debug",
        action="store_true",
        default=_env("DEBUG", "").lower() in {"1", "true", "yes", "on"},
        help="Enable verbose DEBUG logging (overrides --log-level)",
    )
    parser.add_argument(
        "--force-docling",
        action="store_true",
        default=_env("FORCE_DOCLING", "").lower() in {"1", "true", "yes", "on"},
        help="Always convert with Docling (skip text/vector extraction path)",
    )

    args = parser.parse_args(argv)
    log_level = "DEBUG" if args.debug else args.log_level.upper()
    return Settings(
        redis_host=args.redis_host,
        redis_port=args.redis_port,
        redis_db=args.redis_db,
        redis_password=args.redis_password or None,
        redis_event_list=args.redis_event_list,
        redis_output_stream=args.redis_output_stream,
        stream_maxlen=args.stream_maxlen,
        block_seconds=max(1, args.block_seconds),
        mongodb_url=args.mongodb_url,
        mongodb_db=args.mongodb_db,
        hash_collection=args.hash_collection,
        minio_endpoint=args.minio_endpoint,
        minio_access_key=args.minio_access_key,
        minio_secret_key=args.minio_secret_key,
        minio_region=args.minio_region,
        uploaded_bucket=args.uploaded_bucket,
        processed_bucket=args.processed_bucket,
        llm_base_url=args.llm_base_url.rstrip("/"),
        llm_api_key=args.llm_api_key,
        llm_model=args.llm_model,
        llm_timeout=args.llm_timeout,
        force_docling=bool(args.force_docling),
        log_level=log_level,
    )
