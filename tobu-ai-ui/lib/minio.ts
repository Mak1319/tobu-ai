import "server-only"
import { Client } from "minio"

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD
const MINIO_BUCKET = process.env.MINIO_BUCKET

if (!MINIO_ENDPOINT) {
  throw new Error("MINIO_ENDPOINT is not set. Add it to .env.local.")
}
if (!MINIO_ROOT_USER) {
  throw new Error("MINIO_ROOT_USER is not set. Add it to .env.local.")
}
if (!MINIO_ROOT_PASSWORD) {
  throw new Error("MINIO_ROOT_PASSWORD is not set. Add it to .env.local.")
}
if (!MINIO_BUCKET) {
  throw new Error("MINIO_BUCKET is not set. Add it to .env.local.")
}

export const BUCKET = MINIO_BUCKET

// Parse a URL like `http://host:9000` or `https://host` into the pieces the
// MinIO client expects. Defaults to port 9000 for http and 443 for https.
function parseEndpoint(raw: string): {
  endPoint: string
  port: number
  useSSL: boolean
} {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(
      `MINIO_ENDPOINT must be a full URL — got "${raw}". Try http://localhost:9000.`
    )
  }
  const explicitPort = url.port ? Number(url.port) : undefined
  const port = explicitPort ?? (url.protocol === "https:" ? 443 : 9000)
  return {
    endPoint: url.hostname,
    port,
    useSSL: url.protocol === "https:",
  }
}

// Reuse a single client across hot-reloads in dev (same pattern as
// lib/db/connection.ts).
type Cached = { client: Client | null }
const globalForMinio = globalThis as unknown as { _minio?: Cached }
const cached: Cached = globalForMinio._minio ?? { client: null }
if (!globalForMinio._minio) globalForMinio._minio = cached

export const minioClient: Client = cached.client ?? new Client({
  ...parseEndpoint(MINIO_ENDPOINT),
  accessKey: MINIO_ROOT_USER,
  secretKey: MINIO_ROOT_PASSWORD,
})
if (!cached.client) cached.client = minioClient

// Replace unsafe characters in a filename so it can be safely used as part
// an object key. Keeps the extension intact.
function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[\\/]/g, "_")
  // Collapse anything that isn't a letter, number, dot, dash, or underscore.
  const safe = trimmed.replace(/[^A-Za-z0-9._-]+/g, "_")
  // Trim leading/trailing dots and underscores so the key doesn't start
  // with a hidden file marker.
  return safe.replace(/^[._-]+|[._-]+$/g, "") || "file"
}

export function buildObjectKey(chatId: string, filename: string): string {
  return `${chatId}/${Date.now()}-${sanitizeFilename(filename)}`
}

let bucketEnsured: Promise<void> | null = null

// Lazy-create the bucket on first upload so the app works even if the
// minio-init container in docker-compose.yaml didn't run.
export function ensureBucket(): Promise<void> {
  if (!bucketEnsured) {
    bucketEnsured = (async () => {
      const exists = await minioClient.bucketExists(BUCKET)
      if (!exists) {
        await minioClient.makeBucket(BUCKET, undefined)
      }
    })()
  }
  return bucketEnsured
}
