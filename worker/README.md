# imbbox2-worker

Document-processing worker for the Tobu AI app. Reacts to MinIO uploads,
runs Docling to convert the file to Markdown, deduplicates by SHA-256 of
the file bytes, and stores the result in the `processed-documents` bucket.

## How it works

1. Subscribes to `s3:ObjectCreated:*` on the `documents-bucket` via MinIO's
   `listenBucketNotification` (long-lived HTTP stream).
2. On each event, downloads the object, computes a streaming SHA-256.
3. Checks whether a `.md` keyed by that hash already exists in
   `processed-documents`. If so, marks the upload as `ready` and skips
   Docling.
4. Otherwise runs Docling, uploads the markdown to
   `processed-documents/<chatId>/<sha256>.md` with `x-amz-meta-content-hash`
   set.
5. Marks the corresponding `UploadedFile` Mongo row as `ready` (or `failed`
   with the error message).
6. On startup and after every reconnect, sweeps Mongo for any rows still
   in `pending` or stuck in `processing` past 10 minutes and replays the
   pipeline. This makes the worker self-heal across restarts.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MINIO_ENDPOINT` | yes | — | `http://minio:9000` from inside docker, `http://localhost:9000` from host |
| `MINIO_ROOT_USER` | yes | — |  |
| `MINIO_ROOT_PASSWORD` | yes | — |  |
| `MINIO_SOURCE_BUCKET` | no | `documents-bucket` |  |
| `MINIO_DEST_BUCKET` | no | `processed-documents` |  |
| `MONGO_URI` | yes | — |  |
| `MONGO_DB` | no | `tobu_ai` |  |
| `WORKER_POLL_INTERVAL_SEC` | no | `5` | Reconciler sweep interval |
| `WORKER_STUCK_PROCESSING_MIN` | no | `10` | Reconciler timeout to reclaim stuck rows |
| `LOG_LEVEL` | no | `INFO` | structlog level |

## Running locally

```bash
cd worker
uv sync
uv run python -m worker.main
```

## Tests

```bash
uv run pytest
```

## Docker

The service is wired into `docker-compose.yaml` at the repo root. From
there:

```bash
docker compose up -d --build worker
docker compose logs -f worker
```
