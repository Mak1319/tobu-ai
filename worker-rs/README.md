# worker-rs

Rust implementation of the imbbox2 document-processing worker.

## What it does

1. Subscribes to MinIO bucket notifications on `documents-bucket`.
2. For every new object:
   * atomically claims the matching `uploadedfiles` row (`pending → processing`)
   * downloads the bytes
   * computes a SHA-256 hex digest
   * looks up `processed-documents` for an existing object with the same `content-hash`
     * **hit** → mark ready, reuse existing key (no Docling)
     * **miss** → run Docling, optionally run the hidden-text safeguard (PDFs only),
       then PUT the markdown back into `processed-documents` keyed by hash
3. Sweeps Mongo every `WORKER_POLL_INTERVAL_SEC` (default 5s) for `pending` rows and
   for `processing` rows older than `WORKER_STUCK_PROCESSING_MIN` (default 10 min) so
   missed events don't pile up.

## Build / run

```bash
cargo check
cargo test
docker compose up -d --build worker-rs
```

## Env

| var                          | required | default            |
|------------------------------|----------|--------------------|
| `MINIO_ENDPOINT`             | yes      |                    |
| `AWS_ACCESS_KEY_ID`          | yes\*    |                    |
| `AWS_SECRET_ACCESS_KEY`      | yes\*    |                    |
| `MINIO_SOURCE_BUCKET`        | yes      |                    |
| `MINIO_DEST_BUCKET`          | yes      |                    |
| `MONGO_URI`                  | yes      |                    |
| `MONGO_DB`                   | yes      |                    |
| `MONGO_COLLECTION`           | no       | `uploadedfiles`    |
| `WORKER_POLL_INTERVAL_SEC`   | no       | `5`                |
| `WORKER_STUCK_PROCESSING_MIN`| no       | `10`               |
| `LOG_LEVEL`                  | no       | `info`             |

\* also accepts `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`.

## Hidden-text safeguard

For PDFs, after Docling extracts the text we open the same bytes with `pdfium-render`,
walk the per-character text cells with their bounding boxes, render each page at a low
resolution, and sample the pixel under each character. If a character is within ΔE < 8
of the rendered background and that accounts for ≥ 30 % of characters on a page, the
page — and therefore the document — is flagged. The flag:

* appends a `## ⚠️ Hidden text suspected on N page(s)` heading to the markdown,
* sets `flagged: true` on the Mongo `uploadedfiles` row,
* writes `x-amz-meta-flagged: "true"` on the `.md` object.