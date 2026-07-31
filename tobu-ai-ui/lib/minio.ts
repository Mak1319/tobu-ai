import "server-only";
import {
    Client,
    buildARN,
    NotificationConfig,
    ObjectCreatedPut,
    QueueConfig,
} from "minio";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER;
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD;
// Prefer MINIO_BUCKET; fall back to DOCUMENTS_BUCKET so root .env naming works too.
const MINIO_BUCKET =
    process.env.MINIO_BUCKET || process.env.DOCUMENTS_BUCKET || "";
export const PROCESSED_BUCKET =
    process.env.PROCESSED_BUCKET ||
    process.env.MINIO_BUCKET_PROCESSED ||
    "processed-documents";
// Must match compose: arn:minio:sqs::primary:redis
const MINIO_NOTIFY_ARN =
    process.env.MINIO_NOTIFY_ARN ||
    buildARN("minio", "sqs", "", "primary", "redis");

if (!MINIO_ENDPOINT) {
    throw new Error("MINIO_ENDPOINT is not set. Add it to .env.local.");
}
if (!MINIO_ROOT_USER) {
    throw new Error("MINIO_ROOT_USER is not set. Add it to .env.local.");
}
if (!MINIO_ROOT_PASSWORD) {
    throw new Error("MINIO_ROOT_PASSWORD is not set. Add it to .env.local.");
}
if (!MINIO_BUCKET) {
    throw new Error(
        "MINIO_BUCKET (or DOCUMENTS_BUCKET) is not set. Add it to .env.local.",
    );
}

export const BUCKET = MINIO_BUCKET;

// Parse a URL like `http://host:9000` or `https://host` into the pieces the
// MinIO client expects. Defaults to port 9000 for http and 443 for https.
function parseEndpoint(raw: string): {
    endPoint: string;
    port: number;
    useSSL: boolean;
} {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(
            `MINIO_ENDPOINT must be a full URL — got "${raw}". Try http://localhost:9000.`,
        );
    }
    const explicitPort = url.port ? Number(url.port) : undefined;
    const port = explicitPort ?? (url.protocol === "https:" ? 443 : 9000);
    return {
        endPoint: url.hostname,
        port,
        useSSL: url.protocol === "https:",
    };
}

// Reuse a single client across hot-reloads in dev (same pattern as
// lib/db/connection.ts).
type Cached = { client: Client | null };
const globalForMinio = globalThis as unknown as { _minio?: Cached };
const cached: Cached = globalForMinio._minio ?? { client: null };
if (!globalForMinio._minio) globalForMinio._minio = cached;

export const minioClient: Client =
    cached.client ??
    new Client({
        ...parseEndpoint(MINIO_ENDPOINT),
        accessKey: MINIO_ROOT_USER,
        secretKey: MINIO_ROOT_PASSWORD,
    });
if (!cached.client) cached.client = minioClient;

// Replace unsafe characters in a filename so it can be safely used as part
// an object key. Keeps the extension intact.
function sanitizeFilename(name: string): string {
    const trimmed = name.trim().replace(/[\\/]/g, "_");
    // Collapse anything that isn't a letter, number, dot, dash, or underscore.
    const safe = trimmed.replace(/[^A-Za-z0-9._-]+/g, "_");
    // Trim leading/trailing dots and underscores so the key doesn't start
    // with a hidden file marker.
    return safe.replace(/^[._-]+|[._-]+$/g, "") || "file";
}

export function buildObjectKey(chatId: string, filename: string): string {
    return `${chatId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

let bucketEnsured: Promise<void> | null = null;

/**
 * Ensure the documents bucket exists and has a put-event notification wired
 * to the Redis target configured in docker-compose
 * (`arn:minio:sqs::primary:redis`).
 *
 * `createbuckets` in compose does the same at stack start; this is a safety
 * net for local/dev if that one-shot job was skipped.
 */
export function ensureBucket(): Promise<void> {
    if (!bucketEnsured) {
        bucketEnsured = (async () => {
            const exists = await minioClient.bucketExists(BUCKET);
            if (!exists) {
                await minioClient.makeBucket(BUCKET, undefined);
            }
            await ensurePutNotification(BUCKET);
        })().catch((err) => {
            // Allow a later upload to retry setup after a transient MinIO blip.
            bucketEnsured = null;
            throw err;
        });
    }
    return bucketEnsured;
}

async function ensurePutNotification(bucket: string): Promise<void> {
    try {
        const existing = await minioClient.getBucketNotification(bucket);
        const queues = existing?.QueueConfiguration ?? [];
        const alreadyWired = queues.some((q) => {
            const queue = (q as { Queue?: string }).Queue;
            const events = (q as { Event?: string[] }).Event ?? [];
            return (
                queue === MINIO_NOTIFY_ARN &&
                events.some(
                    (e) => e === ObjectCreatedPut || e === "s3:ObjectCreated:*",
                )
            );
        });
        if (alreadyWired) return;

        const config = new NotificationConfig();
        const queue = new QueueConfig(MINIO_NOTIFY_ARN);
        queue.addEvent(ObjectCreatedPut);
        config.add(queue);
        // Preserve any other targets that might already be registered.
        for (const q of queues) {
            const arn = (q as { Queue?: string }).Queue;
            if (!arn || arn === MINIO_NOTIFY_ARN) continue;
            const other = new QueueConfig(arn);
            for (const ev of (q as { Event?: string[] }).Event ?? []) {
                other.addEvent(ev);
            }
            config.add(other);
        }
        await minioClient.setBucketNotification(bucket, config);
    } catch (err) {
        // Notification setup is best-effort: the bucket can still accept uploads.
        // Log so operators notice when the worker will not receive events.
        console.error(
            `[minio] failed to ensure put notification on ${bucket} → ${MINIO_NOTIFY_ARN}:`,
            err,
        );
    }
}
