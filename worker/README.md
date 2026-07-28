# docling-worker

Two-process Celery worker triggered by **SeaweedFS filer notifications**
delivered over a Redis pub/sub channel:

| Process | What it does |
|---|---|
| `bridge` (`main.py`) | Subscribes to the Redis channel and pushes each event onto the Celery `docling` queue. Tiny, no ML. |
| Celery worker (`tasks.py`) | Downloads the file from the SeaweedFS filer HTTP API, runs it through [docling](https://github.com/docling-project/docling), and writes the extracted markdown to the `processed-documents` S3 bucket. |

## Buckets

Two S3 buckets (defined in `infra/config/buckets.toml`, seeded by the
SeaweedFS S3 gateway via the `-s3.buckets.tomls` flag):

| Bucket | Purpose | Key shape |
|---|---|---|
| `documents-bucket` | Raw uploads (S3 PUTs from the app). | whatever the uploader chooses |
| `processed-documents` | Docling output. | `<sha256>.md` |

The worker keys the output by **SHA-256 of the source file**, so dedup
is a single `HEAD` against `processed-documents/<sha256>.md`. If a
document with the same hash has already been processed, the worker
skips the conversion and just records the skip.

End-to-end flow:

1. App `PUT`s a file to `s3://documents-bucket/uploads/foo.pdf` (or
   directly to the filer at `/uploads/foo.pdf`).
2. SeaweedFS filer publishes a notification to Redis channel
   `seaweedfs_filer`.
3. `bridge` (`main.py`) dispatches a `docling.process_document` Celery
   task on the `docling` queue.
4. Celery worker downloads the file, computes SHA-256, checks
   `s3://processed-documents/<sha256>.md`:
   - if it exists → logs `skip ... already processed` and returns.
   - otherwise → runs docling, PUTs the markdown to
     `s3://processed-documents/<sha256>.md`.

## Run with docker compose

From the repo root:

```bash
docker compose up -d redis seaweedfs docling-worker docling-bridge
```

The `docling-bridge` service runs the pub/sub listener; the `docling-worker`
service runs the Celery worker that actually loads the docling models and
converts documents. On startup, the worker creates `documents-bucket` and
`processed-documents` if they don't exist yet.

## Run locally with uv

In two terminals:

```bash
# terminal 1 — celery worker (does the docling work)
cd worker
uv sync
uv run celery -A tasks worker --loglevel=INFO --queue=docling

# terminal 2 — pub/sub bridge
cd worker
uv run python main.py
```

## Trigger a job manually

```python
from tasks import process_document
process_document.delay("/uploads/example.pdf")
# -> {'path': '/uploads/example.pdf',
#     'sha256': '...',
#     'skipped': False,
#     'markdown_chars': 1234,
#     'key': 's3://processed-documents/<sha256>.md'}
```

## Configuration (via root `.env` or environment)

| Variable | Default | Notes |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis host (used for both pub/sub and Celery broker) |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _empty_ | Redis `requirepass` if set |
| `REDIS_DB` | `0` | Redis DB number (for pub/sub; Celery uses DB 0) |
| `REDIS_CHANNEL` | `seaweedfs_filer` | Channel SeaweedFS publishes to |
| `CELERY_QUEUE` | `docling` | Queue the bridge dispatches into |
| `SEAWEEDFS_FILER_URL` | `http://localhost:8888` | Filer HTTP base URL |
| `SEAWEEDFS_SECRET` | _empty_ | Value of `-filer.dirfiler.secret` if used |
| `S3_ENDPOINT` | `http://localhost:8333` | SeaweedFS S3 gateway |
| `S3_ACCESS_KEY` | `admin` | S3 access key |
| `S3_SECRET_KEY` | `admin` | S3 secret key |
| `S3_REGION` | `us-east-1` | S3 region (most clients require a value) |
| `S3_BUCKET_RAW` | `documents-bucket` | Bucket raw uploads land in |
| `S3_BUCKET_PROCESSED` | `processed-documents` | Bucket docling writes to |
| `WORK_DIR` | `/tmp/docling-worker` | Local scratch dir for downloaded files |
| `LOG_LEVEL` | `INFO` | Standard logging level |

## Wiring SeaweedFS to publish to Redis

`infra/config/notification.toml` is mounted into the seaweedfs container
at `/etc/seaweedfs/notification.toml` and loaded via
`-filer.notify.url`. It defines a Redis pub/sub target that fires only
for filer paths matching `/uploads/`, so internal filer bookkeeping
(`/etc/...`, `.meta` files) doesn't pollute the queue. The
`docling-worker` containers depend on `seaweedfs` and `redis` being
healthy before they start.

The bridge reads each message as JSON and looks for the standard
SeaweedFS fields: `Action` (`create` / `update` / `delete` / `rename`),
`Path`, and `NewPath`. Anything without a usable `NewPath` / `Path`
(e.g. `delete` events) is skipped.
