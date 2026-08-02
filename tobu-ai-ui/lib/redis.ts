import "server-only";
import Redis, { type Redis as RedisClient } from "ioredis";

/**
 * Server-side Redis helpers used by the worker-events SSE bridge.
 *
 * The `document-worker` writes object-created notifications to a Redis list
 * and appends a completion event to the `docling_result` stream once docling
 * has produced markdown. The SSE bridge reads history (catch-up) then live
 * `XREAD` so reconnects / late opens do not miss events.
 *
 * Connection settings mirror the ones in workers:
 *   REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD
 *   STREAM_RESULT_KEY (canonical: "docling_result"; aliases REDIS_OUTPUT_STREAM / PUBSUB_RESULT_CHANNEL)
 *   QUIZ_AGENT_STREAM (canonical: "quiz_agent_bus")
 */

const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT ?? "6379", 10);
const REDIS_DB = Number.parseInt(process.env.REDIS_DB ?? "0", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
export const STREAM_RESULT_KEY =
    process.env.STREAM_RESULT_KEY ??
    process.env.REDIS_OUTPUT_STREAM ??
    process.env.PUBSUB_RESULT_CHANNEL ??
    "docling_result";

/** Quiz agents bus (LiveKit ↔ QG ↔ AA), filtered by chatId. */
export const QUIZ_AGENT_STREAM =
    process.env.QUIZ_AGENT_STREAM ?? "quiz_agent_bus";

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

/**
 * Normalized Docling / topicable result event.
 * Accepts both initdata snake_case and topicable camelCase fields.
 */
export type DoclingResultEvent = {
    session_id: string | null;
    status: "processed" | "skipped" | "error" | "success" | "partial" | "cached" | string;
    file_key: string;
    md_key?: string;
    sha256?: string;
    markdown_chars?: number;
    error?: string;
    topicGraphReady?: boolean;
};

export type DoclingStreamEntry = {
    id: string;
    event: DoclingResultEvent;
};

type RawDoclingPayload = Record<string, unknown>;

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/** Map topicable / initdata status payloads onto one UI shape. */
export function normalizeDoclingResult(
    raw: RawDoclingPayload,
): DoclingResultEvent | null {
    const status = asNonEmptyString(raw.status);
    if (!status) return null;

    const session_id =
        asNonEmptyString(raw.session_id) ??
        asNonEmptyString(raw.sessionId) ??
        null;

    const sha256 =
        asNonEmptyString(raw.sha256) ??
        asNonEmptyString(raw.fileHash) ??
        asNonEmptyString(raw.file_hash);

    const file_key =
        asNonEmptyString(raw.file_key) ??
        asNonEmptyString(raw.uploadKey) ??
        asNonEmptyString(raw.upload_key) ??
        sha256;
    // Status-only worker messages always carry sessionId + fileHash + status.
    if (!session_id && !file_key && !sha256) return null;

    const md_key =
        asNonEmptyString(raw.md_key) ??
        asNonEmptyString(raw.mdKey) ??
        (sha256 ? `${sha256}.md` : undefined);

    const error = asNonEmptyString(raw.error);
    const topicGraphReady =
        typeof raw.topicGraphReady === "boolean"
            ? raw.topicGraphReady
            : undefined;

    return {
        session_id,
        status,
        file_key: file_key ?? "unknown",
        ...(md_key ? { md_key } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(error ? { error } : {}),
        ...(topicGraphReady !== undefined ? { topicGraphReady } : {}),
    };
}

export function parseDoclingResult(raw: string): DoclingResultEvent | null {
    try {
        const parsed = JSON.parse(raw) as RawDoclingPayload;
        if (!parsed || typeof parsed !== "object") return null;
        return normalizeDoclingResult(parsed);
    } catch {
        return null;
    }
}

/** Statuses that mean markdown (and optionally topic graph) is available. */
export function isDoclingReadyStatus(status: string): boolean {
    return (
        status === "processed" ||
        status === "skipped" ||
        status === "success" ||
        status === "partial" ||
        status === "cached"
    );
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

/** Shape published by agents/quiz shared.redis_bus. */
export type QuizAgentEvent = {
    chatId: string;
    from: string;
    to: string;
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    ts?: number;
};

export type QuizStreamEntry = {
    id: string;
    event: QuizAgentEvent;
};

export function parseQuizAgentEvent(raw: string): QuizAgentEvent | null {
    try {
        const parsed = JSON.parse(raw) as QuizAgentEvent;
        if (!parsed || typeof parsed !== "object") return null;
        if (typeof parsed.chatId !== "string") return null;
        if (typeof parsed.type !== "string") return null;
        return parsed;
    } catch {
        return null;
    }
}

function quizEntryFromFields(
    id: string,
    fields: string[],
): QuizStreamEntry | null {
    let payload: string | undefined;
    for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "payload") {
            payload = fields[i + 1];
            break;
        }
    }
    if (payload === undefined) return null;
    const event = parseQuizAgentEvent(payload);
    if (!event) return null;
    return { id, event };
}

export async function readQuizHistory(
    redis: RedisClient,
    count = STREAM_HISTORY_COUNT,
): Promise<{ entries: QuizStreamEntry[]; newestId: string | null }> {
    const rows = await redis.xrevrange(QUIZ_AGENT_STREAM, "+", "-", "COUNT", count);
    const newestId = rows.length > 0 ? rows[0]![0] : null;
    const entries: QuizStreamEntry[] = [];
    for (const [id, fields] of rows) {
        const entry = quizEntryFromFields(id, fields);
        if (entry) entries.push(entry);
    }
    entries.reverse();
    return { entries, newestId };
}

export async function readQuizLive(
    redis: RedisClient,
    lastId: string,
    blockMs = 15_000,
): Promise<QuizStreamEntry[]> {
    const result = await redis.xread(
        "BLOCK",
        blockMs,
        "STREAMS",
        QUIZ_AGENT_STREAM,
        lastId,
    );
    if (!result) return [];

    const entries: QuizStreamEntry[] = [];
    for (const [, messages] of result) {
        for (const [id, fields] of messages) {
            const entry = quizEntryFromFields(id, fields);
            if (entry) entries.push(entry);
        }
    }
    return entries;
}
