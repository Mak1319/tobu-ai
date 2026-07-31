import "server-only";
import Redis, { type Redis as RedisClient } from "ioredis";

/**
 * Server-side Redis helpers used by the worker-events SSE bridge.
 *
 * The `document-worker` writes object-created notifications to a Redis list
 * and appends a completion event to the `docling_results` stream once docling
 * has produced markdown. The SSE bridge reads history (catch-up) then live
 * `XREAD` so reconnects / late opens do not miss events.
 *
 * Connection settings mirror the ones in `worker/main.py`:
 *   REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD
 *   STREAM_RESULT_KEY (or legacy PUBSUB_RESULT_CHANNEL; default "docling_results")
 */

const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT ?? "6379", 10);
const REDIS_DB = Number.parseInt(process.env.REDIS_DB ?? "0", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
export const STREAM_RESULT_KEY =
    process.env.STREAM_RESULT_KEY ??
    process.env.PUBSUB_RESULT_CHANNEL ??
    "docling_results";

/** How many recent stream entries to scan on a fresh SSE connect (no Last-Event-ID). */
export const STREAM_HISTORY_COUNT = Number.parseInt(
    process.env.STREAM_HISTORY_COUNT ?? "200",
    10,
);

declare global {
    // Reuse a single command connection across hot-reloads in dev (mirrors
    // `lib/db/connection.ts`).
    var __tobu_redis_cmd: RedisClient | undefined;
}

function createClient(options?: { blocking?: boolean }): RedisClient {
    return new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        db: REDIS_DB,
        password: REDIS_PASSWORD,
        lazyConnect: false,
        // Blocking XREAD requires maxRetriesPerRequest: null in ioredis.
        maxRetriesPerRequest: options?.blocking ? null : 3,
        enableReadyCheck: true,
    });
}

/** Shared Redis client for normal commands (GET/SET/XADD/etc). */
export function getRedis(): RedisClient {
    if (!globalThis.__tobu_redis_cmd) {
        globalThis.__tobu_redis_cmd = createClient();
        globalThis.__tobu_redis_cmd.on("error", (err: Error) => {
            console.error("[redis] command connection error", err.message);
        });
    }
    return globalThis.__tobu_redis_cmd;
}

/**
 * Dedicated Redis connection for blocking XREAD on one SSE client.
 * Callers must `quit()` / `disconnect()` when the SSE client goes away.
 */
export function createRedisStreamReader(): RedisClient {
    const client = createClient({ blocking: true });
    client.on("error", (err: Error) => {
        console.error("[redis] stream reader connection error", err.message);
    });
    return client;
}

/** Shape of the JSON payload published by `document-worker`. */
export type DoclingResultEvent = {
    session_id: string | null;
    status: "processed" | "skipped" | "error" | string;
    file_key: string;
    md_key?: string;
    sha256?: string;
    markdown_chars?: number;
    error?: string;
};

export type DoclingStreamEntry = {
    id: string;
    event: DoclingResultEvent;
};

export function parseDoclingResult(raw: string): DoclingResultEvent | null {
    try {
        const parsed = JSON.parse(raw) as DoclingResultEvent;
        if (!parsed || typeof parsed !== "object") return null;
        if (typeof parsed.file_key !== "string") return null;
        if (typeof parsed.status !== "string") return null;
        return parsed;
    } catch {
        return null;
    }
}

function entryFromFields(
    id: string,
    fields: string[],
): DoclingStreamEntry | null {
    // ioredis returns flat [field, value, ...] arrays for stream entries.
    let payload: string | undefined;
    for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "payload") {
            payload = fields[i + 1];
            break;
        }
    }
    if (payload === undefined) return null;
    const event = parseDoclingResult(payload);
    if (!event) return null;
    return { id, event };
}

export type DoclingHistoryResult = {
    /** Parseable entries in chronological order. */
    entries: DoclingStreamEntry[];
    /** Newest stream id in the scanned window (even if unparseable), else null. */
    newestId: string | null;
};

/**
 * Replay recent stream history (newest first from Redis, returned oldest-first).
 * Used when the SSE client connects without a Last-Event-ID.
 */
export async function readDoclingHistory(
    redis: RedisClient,
    count = STREAM_HISTORY_COUNT,
): Promise<DoclingHistoryResult> {
    const rows = await redis.xrevrange(STREAM_RESULT_KEY, "+", "-", "COUNT", count);
    const newestId = rows.length > 0 ? rows[0]![0] : null;
    const entries: DoclingStreamEntry[] = [];
    for (const [id, fields] of rows) {
        const entry = entryFromFields(id, fields);
        if (entry) entries.push(entry);
    }
    entries.reverse(); // chronological order for the client
    return { entries, newestId };
}

/**
 * Blocking live read after `lastId`. Returns [] on block timeout.
 * `lastId` should be the last delivered stream id, or "0-0" / "$".
 */
export async function readDoclingLive(
    redis: RedisClient,
    lastId: string,
    blockMs = 15_000,
): Promise<DoclingStreamEntry[]> {
    const result = await redis.xread(
        "BLOCK",
        blockMs,
        "STREAMS",
        STREAM_RESULT_KEY,
        lastId,
    );
    if (!result) return [];

    const entries: DoclingStreamEntry[] = [];
    for (const [, messages] of result) {
        for (const [id, fields] of messages) {
            const entry = entryFromFields(id, fields);
            if (entry) entries.push(entry);
        }
    }
    return entries;
}
