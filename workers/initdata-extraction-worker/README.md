# Document worker

This is a standalone worker. It does **not** use `tasks.py` or Celery.

## Flow

1. Block on the Redis list configured by `REDIS_EVENT_KEY`.
2. Read MinIO object-created notifications and extract the object key and
   `session_id`/`chat_id` metadata.
3. Download the source object from `DOCUMENTS_BUCKET` and calculate its SHA-256.
4. `HEAD` `processed-documents/<sha256>.md` (or the configured
   `PROCESSED_BUCKET`). Existing output is skipped.
5. Convert new documents to Markdown with Docling and upload the result.
6. Append a JSON status event to the Redis stream `STREAM_RESULT_KEY`
   (via `XADD`) so the UI SSE bridge can catch up if it reconnects late.

The worker handles MinIO notification payloads containing `Records` as well as
payloads wrapped in an `Event` array. If event metadata is unavailable, it
reads metadata from the object itself and finally falls back to the first path
component of the object key (the upload route uses the chat/session ID there).

## Configuration

Copy `worker/.env.example` to `worker/.env`. The worker also loads the
repository root `.env`; values in `worker/.env` take precedence.

| Variable                | Default                 |
| ----------------------- | ----------------------- |
| `REDIS_HOST`            | `localhost`             |
| `REDIS_PORT`            | `6379`                  |
| `REDIS_DB`              | `0`                     |
| `REDIS_PASSWORD`        | empty                   |
| `REDIS_EVENT_KEY`       | `minio-events`          |
| `STREAM_RESULT_KEY`     | `docling_result`        |
| `STREAM_MAXLEN`         | `10000`                 |
| `MINIO_ENDPOINT`        | `http://localhost:9000` |
| `MINIO_ROOT_USER`       | `minioadmin`            |
| `MINIO_ROOT_PASSWORD`   | empty                   |
| `MINIO_REGION`          | `us-east-1`             |
| `DOCUMENTS_BUCKET`      | `documents-bucket`      |
| `PROCESSED_BUCKET`      | `processed-documents`   |
| `LOG_LEVEL`             | `INFO`                  |

When Redis and MinIO run through Compose but the worker runs on the host, use
`localhost` values. When the worker runs as a process inside the Compose
network, use `redis` and `http://minio:9000` instead.

## Run locally

```bash
cd worker
cp .env.example .env
uv sync
uv run python main.py
```

Or with an already active virtual environment:

```bash
python main.py
```

Read recent result events from the stream:

```bash
redis-cli -a "$REDIS_PASSWORD" XREVRANGE docling_result + - COUNT 10
```

The notification setup must push MinIO object-created events to the same Redis
list named by `REDIS_EVENT_KEY`. The worker does not create buckets or configure
MinIO notifications.

## Run with Docker Compose

The repository Compose file contains an active `document-worker` service. It
uses the root `.env` file and connects to the Compose services as `redis` and
`http://minio:9000`.

```bash
# Build the worker image
docker compose build document-worker

# Start infrastructure and the worker
docker compose up -d redis minio createbuckets document-worker

# Follow worker logs
docker compose logs -f document-worker
```

The Docker image runs `uv run python main.py`; it does not start Celery and does
not use `tasks.py`.
