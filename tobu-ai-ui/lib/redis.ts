import "server-only";
import Redis, { type Redis as RedisClient } from "ioredis";

/**
 * Server-side Redis singleton used by the worker-events SSE bridge.
 *
 * The `document-worker` writes object-created notifications to a Redis list
 * and publishes a completion event on the `docling_results` pubsub channel
 * once docling has produced markdown. We subscribe to that channel so the
 * browser can react without polling.
 *
 * Connection settings mirror the ones in `worker/main.py`:
 *   REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD
 *   PUBSUB_RESULT_CHANNEL (defaults to "docling_results")
 */

const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT ?? "6379", 10);
const REDIS_DB = Number.parseInt(process.env.REDIS_DB ?? "0", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
export const PUBSUB_RESULT_CHANNEL =
    process.env.PUBSUB_RESULT_CHANNEL ?? "docling_results";

declare global {
    // Reuse a single connection across hot-reloads in dev (mirrors
    // `lib/db/connection.ts`). The pubsub uses a dedicated connection so the
    // subscriber loop doesn't block other Redis traffic.
    var __tobu_redis_pub: RedisClient | undefined;
}

function createClient(): RedisClient {
    return new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        db: REDIS_DB,
        password: REDIS_PASSWORD,
        lazyConnect: false,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
    });
}

export function getRedis(): RedisClient {
    if (!globalThis.__tobu_redis_pub) {
        globalThis.__tobu_redis_pub = createClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalThis.__tobu_redis_pub.on("error", (err: { message: any }) => {
            // The EventSource bridge will surface this to the client; we just
            // log on the server to avoid spamming in dev.
            console.error("[redis] pubsub connection error", err.message);
        });
    }
    return globalThis.__tobu_redis_pub;
}
