"""topicable worker: Redis list (MinIO) -> MinIO -> markdown -> topic graph -> Mongo/Redis."""

from __future__ import annotations

import hashlib
import logging
import signal
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote_plus

from config import Settings, build_settings
from document import to_markdown
from graph import TopicGraphBuilder
from mongo import HashStore
from redis_io import RedisIO, parse_list_message
from storage import ObjectStore

log = logging.getLogger("topicable")
_stop = False


def _request_stop(_signum: int, _frame: Any) -> None:
    global _stop
    _stop = True
    log.info("shutdown requested")


def _preview(text: str, limit: int = 240) -> str:
    flat = " ".join(text.split())
    if len(flat) <= limit:
        return flat
    return flat[:limit] + "…"


def process_job(
    settings: Settings,
    redis_io: RedisIO,
    store: ObjectStore,
    hash_store: HashStore,
    graph_builder: TopicGraphBuilder,
    session_id: str | None,
    upload_key: str,
    file_hash_hint: str | None,
) -> None:
    """Process one upload.

    Hash is always recomputed from object bytes (SHA-256) so MinIO keys and
    the UI client hash stay aligned. Notification eTag fallbacks are only a hint.
    """
    job_started = time.perf_counter()
    upload_key = unquote_plus(upload_key)
    log.info(
        "▶ job start session=%s uploadKey=%s hashHint=%s",
        session_id,
        upload_key,
        file_hash_hint,
    )

    # --- step 1: download ---
    log.debug(
        "step 1/6: downloading s3://%s/%s",
        settings.uploaded_bucket,
        upload_key,
    )
    t0 = time.perf_counter()
    source, metadata = store.download(upload_key)
    log.debug(
        "download done in %.3fs bytes=%d metadata=%s",
        time.perf_counter() - t0,
        len(source),
        metadata,
    )
    if not source:
        log.error("empty object for uploadKey=%s", upload_key)
        redis_io.publish_status(
            session_id=session_id,
            upload_key=upload_key,
            file_hash=file_hash_hint,
            status="error",
            error="empty object",
        )
        return

    # Authoritative content hash (matches browser WebCrypto SHA-256 hex).
    file_hash = hashlib.sha256(source).hexdigest()
    md_key = f"{file_hash}.md"
    if file_hash_hint and file_hash_hint.lower() != file_hash:
        log.warning(
            "hash hint mismatch hint=%s computed=%s — using computed SHA-256",
            file_hash_hint,
            file_hash,
        )

    # --- step 2: cache lookup ---
    log.debug("step 2/6: looking up hashContentMap for hashId=%s", file_hash)
    t0 = time.perf_counter()
    cached = hash_store.find_by_hash(file_hash)
    log.debug("hash lookup done in %.3fs cached=%s", time.perf_counter() - t0, bool(cached))
    if cached:
        content = cached.get("content") if isinstance(cached.get("content"), dict) else {}
        cached_md_key = str(content.get("markdownKey") or md_key)
        if store.exists(cached_md_key):
            log.info(
                "cache HIT hashId=%s md=%s — skipping convert/LLM",
                file_hash,
                cached_md_key,
            )
            redis_io.publish_status(
                session_id=session_id,
                upload_key=upload_key,
                file_hash=file_hash,
                status="skipped",
                cached=True,
                md_key=cached_md_key,
            )
            log.info(
                "✔ job done (cached) in %.3fs hash=%s",
                time.perf_counter() - job_started,
                file_hash,
            )
            return

        # Mongo has graph metadata but processed markdown object is missing —
        # rebuild markdown only and keep the cached topic graph.
        log.warning(
            "cache HIT hashId=%s but s3://%s/%s missing — regenerating markdown",
            file_hash,
            settings.processed_bucket,
            cached_md_key,
        )
        filename = Path(upload_key).name
        content_type = metadata.get("content-type") or metadata.get("content_type")
        markdown, method = to_markdown(
            source,
            filename,
            content_type,
            force_docling=settings.force_docling,
        )
        store.upload_markdown(cached_md_key, markdown)
        content = {
            **content,
            "markdownKey": cached_md_key,
            "conversionMethod": method,
            "markdownChars": len(markdown),
        }
        hash_store.upsert(file_hash, content)
        redis_io.publish_status(
            session_id=session_id,
            upload_key=upload_key,
            file_hash=file_hash,
            status="skipped",
            cached=True,
            md_key=cached_md_key,
        )
        log.info(
            "✔ job done (cached+restored md) in %.3fs hash=%s",
            time.perf_counter() - job_started,
            file_hash,
        )
        return

    log.info("cache MISS hashId=%s — processing document", file_hash)

    # --- step 3: convert ---
    filename = Path(upload_key).name
    content_type = metadata.get("content-type") or metadata.get("content_type")
    log.info(
        "step 3/6: converting filename=%s content_type=%s size=%d",
        filename,
        content_type,
        len(source),
    )
    t0 = time.perf_counter()
    markdown, method = to_markdown(
        source,
        filename,
        content_type,
        force_docling=settings.force_docling,
    )
    log.info(
        "conversion done method=%s chars=%d elapsed=%.3fs",
        method,
        len(markdown),
        time.perf_counter() - t0,
    )
    log.debug("markdown preview: %s", _preview(markdown))

    # --- step 4: upload processed markdown ---
    log.debug(
        "step 4/6: uploading markdown to s3://%s/%s",
        settings.processed_bucket,
        md_key,
    )
    t0 = time.perf_counter()
    store.upload_markdown(md_key, markdown)
    log.debug("upload done in %.3fs", time.perf_counter() - t0)

    # --- step 5: topic graph via LLM ---
    log.info(
        "step 5/6: building topic graph model=%s base=%s",
        settings.llm_model,
        settings.llm_base_url,
    )
    t0 = time.perf_counter()
    topic_graph = graph_builder.build(markdown)
    log.info(
        "topic graph done ready=%s elapsed=%.3fs",
        topic_graph is not None,
        time.perf_counter() - t0,
    )
    if topic_graph is not None:
        log.debug(
            "graph summary subjects=%d nodes=%d edges=%d",
            len(topic_graph.get("subjects") or []),
            len(topic_graph.get("nodes") or []),
            len(topic_graph.get("edges") or []),
        )

    content = {
        "markdownKey": md_key,
        "conversionMethod": method,
        "markdownChars": len(markdown),
        "topicGraph": topic_graph,
    }

    # --- step 6: persist + notify ---
    # Always persist markdown pointer; topicGraph may be null on partial.
    log.debug("step 6/6: storing content in hashContentMap hashId=%s", file_hash)
    hash_store.upsert(file_hash, content)
    status = "success" if topic_graph is not None else "partial"
    if topic_graph is None:
        log.warning(
            "topic graph missing — stored markdown only hash=%s",
            file_hash,
        )

    log.debug("publishing status=%s to output stream", status)
    redis_io.publish_status(
        session_id=session_id,
        upload_key=upload_key,
        file_hash=file_hash,
        status=status,
        cached=False,
        md_key=md_key,
    )
    log.info(
        "✔ job done status=%s in %.3fs hash=%s method=%s",
        status,
        time.perf_counter() - job_started,
        file_hash,
        method,
    )


def _log_startup(settings: Settings) -> None:
    log.info("topicable starting log_level=%s", settings.log_level)
    log.info(
        "redis %s:%s db=%s input_list=%s (BLPOP) output_stream=%s (XADD)",
        settings.redis_host,
        settings.redis_port,
        settings.redis_db,
        settings.redis_event_list,
        settings.redis_output_stream,
    )
    log.info(
        "mongo url=%s db=%s collection=%s",
        settings.mongodb_url,
        settings.mongodb_db,
        settings.hash_collection,
    )
    log.info(
        "minio endpoint=%s uploaded=%s processed=%s",
        settings.minio_endpoint,
        settings.uploaded_bucket,
        settings.processed_bucket,
    )
    log.info(
        "llm base_url=%s model=%s timeout=%.1fs",
        settings.llm_base_url,
        settings.llm_model,
        settings.llm_timeout,
    )
    log.info("force_docling=%s", settings.force_docling)
    log.debug(
        "minio access_key=%s secret_set=%s",
        settings.minio_access_key,
        bool(settings.minio_secret_key),
    )
    log.debug(
        "redis password_set=%s block_seconds=%s",
        bool(settings.redis_password),
        settings.block_seconds,
    )


def run(settings: Settings) -> None:
    _log_startup(settings)

    log.debug("connecting redis…")
    redis_io = RedisIO(settings)
    log.debug("connecting minio…")
    store = ObjectStore(settings)
    log.debug("connecting mongodb…")
    hash_store = HashStore(settings)
    log.debug("initializing LLM client…")
    graph_builder = TopicGraphBuilder(settings)

    queued = redis_io.list_length()
    log.info(
        "listening on Redis list=%s (queued=%d, block=%ss) → stream=%s",
        settings.redis_event_list,
        queued,
        settings.block_seconds,
        settings.redis_output_stream,
    )

    idle_polls = 0
    try:
        while not _stop:
            raw = redis_io.blpop()
            if raw is None:
                idle_polls += 1
                if idle_polls == 1 or idle_polls % 12 == 0:
                    log.debug(
                        "waiting for RPUSH on list=%s (idle polls=%d, llen=%d)",
                        settings.redis_event_list,
                        idle_polls,
                        redis_io.list_length(),
                    )
                continue

            idle_polls = 0
            log.debug("raw list message=%s", raw)
            event = parse_list_message(raw)
            session_id = event["sessionId"]
            upload_key = event["uploadKey"]
            file_hash = event["fileHash"]
            log.info(
                "← list event session=%s key=%s hash=%s",
                session_id,
                upload_key,
                file_hash,
            )
            try:
                if not upload_key:
                    log.error(
                        "invalid event missing uploadKey hash=%s",
                        file_hash,
                    )
                    redis_io.publish_status(
                        session_id=session_id,
                        upload_key=upload_key,
                        file_hash=file_hash,
                        status="error",
                        error="missing uploadKey",
                    )
                else:
                    process_job(
                        settings,
                        redis_io,
                        store,
                        hash_store,
                        graph_builder,
                        session_id,
                        upload_key,
                        file_hash,
                    )
            except Exception:
                log.exception("job failed uploadKey=%s fileHash=%s", upload_key, file_hash)
                redis_io.publish_status(
                    session_id=session_id,
                    upload_key=upload_key,
                    file_hash=file_hash,
                    status="error",
                    error="unhandled exception — see worker logs",
                )
    finally:
        log.debug("closing clients…")
        graph_builder.close()
        hash_store.close()
        redis_io.close()
        log.info("worker stopped")


def main(argv: list[str] | None = None) -> None:
    settings = build_settings(argv)
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
        force=True,
    )
    if settings.log_level == "DEBUG":
        logging.getLogger("botocore").setLevel(logging.WARNING)
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.INFO)
        logging.getLogger("httpx").setLevel(logging.INFO)
        log.debug("debug mode on — third-party loggers dampened")

    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)
    run(settings)


if __name__ == "__main__":
    main(sys.argv[1:])
