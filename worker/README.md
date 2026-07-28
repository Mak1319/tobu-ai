# docling-worker

Two-process Celery worker triggered by **MinIO bucket notifications** delivered
as Redis list events (RPUSH / BLPOP). Completion is announced on a Redis
**pub/sub** channel.

| Process                    | What it does                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bridge` (`main.py`)       | `BLPOP`s `REDIS_EVENT_KEY` and enqueues each upload onto the Celery `docling` queue. Tiny, no ML.                                                                                                                |
| Celery worker (`tasks.py`) | Downloads the object from MinIO (`documents-bucket`), runs [docling](https://github.com/docling-project/docling), writes markdown to `processed-documents`, and **PUBLISH**es status on `PUBSUB_RESULT_CHANNEL`. |

## Buckets

| Bucket                | Purpose                             | Key shape                         |
| --------------------- | ----------------------------------- | --------------------------------- |
| `documents-bucket`    | Raw uploads (S3 PUTs from the app). | `{chatId}/{timestamp}-{filename}` |
| `processed-documents` | Docling output.                     | `<sha256>.md`                     |

The worker keys output by **SHA-256 of the source file**, so dedup is a single
`HEAD` against `processed-documents/<sha256>.md`. If that object already
exists, the worker skips conversion and publishes `status: skipped`.

End-to-end flow:

1. App `PUT`s a file to `s3://documents-bucket/{chatId}/...`.
2. MinIO RPUSHes an event onto Redis list `REDIS_EVENT_KEY` (`minio-events-queue`).
3. `bridge` (`main.py`) dispatches `tasks.process_document` on the `docling` queue.
4. Celery worker downloads, hashes, converts (or skips), writes markdown, then
   **PUBLISH**es JSON on `docling_results`:
    ```json
    {
        "session_id": "<chatId>",
        "status": "processed|skipped|error",
        "file_key": "...",
        "md_key": "<sha256>.md"
    }
    ```

## Run with docker compose

From the repo root (infra + both worker processes):

```bash
docker compose up -d redis minio createbuckets docling-bridge docling-worker
```

## Run locally with uv

```bash
# terminal 1 — celery worker
cd worker
uv sync
uv run celery -A tasks worker --loglevel=INFO --queue=docling

# terminal 2 — Redis list bridge
cd worker
uv run python main.py
```

Point `REDIS_HOST` / `MINIO_ENDPOINT` at localhost if the stack is running via
compose and you are running the worker on the host:

```bash
REDIS_HOST=localhost MINIO_ENDPOINT=http://localhost:9000 uv run python main.py
```

## Subscribe to completion events

```bash
redis-cli -a "$REDIS_PASSWORD" SUBSCRIBE docling_results
```

## Configuration

Values default to the docker-compose service names. Override via `worker/.env`
or the process environment (root `.env` is loaded by compose).

| Variable                | Default                   | Notes                                   |
| ----------------------- | ------------------------- | --------------------------------------- |
| `REDIS_HOST`            | `redis`                   | Redis host                              |
| `REDIS_PORT`            | `6379`                    | Redis port                              |
| `REDIS_PASSWORD`        | _(from root .env)_        | `requirepass`                           |
| `REDIS_DB`              | `0`                       | DB for the event list + result pub/sub  |
| `REDIS_EVENT_KEY`       | `minio-events-queue`      | List MinIO RPUSHes into; bridge BLOPs   |
| `PUBSUB_RESULT_CHANNEL` | `docling_results`         | Channel worker PUBLISHes completion on  |
| `CELERY_BROKER_URL`     | `redis://:…@redis:6379/1` | Auto-built from Redis settings if unset |
| `CELERY_RESULT_BACKEND` | `redis://:…@redis:6379/2` | Auto-built from Redis settings if unset |
| `CELERY_QUEUE`          | `docling`                 | Queue name                              |
| `MINIO_ENDPOINT`        | `http://minio:9000`       | S3 API URL                              |
| `MINIO_ROOT_USER`       | `minioadmin`              | Access key                              |
| `MINIO_ROOT_PASSWORD`   | _(from root .env)_        | Secret key                              |
| `DOCUMENTS_BUCKET`      | `documents-bucket`        | Source bucket                           |
| `PROCESSED_BUCKET`      | `processed-documents`     | Output bucket                           |
| `LOG_LEVEL`             | `INFO`                    | Logging level                           |
