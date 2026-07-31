import {
    createRedisStreamReader,
    readDoclingHistory,
    readDoclingLive,
    STREAM_RESULT_KEY,
    type DoclingStreamEntry,
} from "@/lib/redis";

export const runtime = "nodejs";
// Keep the SSE connection open for as long as the client stays connected.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Same slug rules as /api/upload — chatId is used as a filter key, so reject
// anything that could be used as a path-traversal style value.
const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STREAM_ID_RE = /^\d+-\d+$/;

const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown, id?: string): Uint8Array {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    const idLine = id ? `id: ${id}\n` : "";
    return encoder.encode(`${idLine}event: ${event}\ndata: ${payload}\n\n`);
}

/**
 * SSE bridge: browser EventSource → Redis stream `docling_results`.
 *
 * The document-worker XADDs:
 *   { session_id, status, file_key, md_key?, sha256?, markdown_chars?, error? }
 *
 * On connect we replay recent matching history (or resume from Last-Event-ID),
 * then blocking XREAD for live events. Only entries whose `session_id`
 * matches the chatId path param are forwarded.
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ chatId: string }> },
) {
    const { chatId } = await context.params;

    if (!CHAT_ID_RE.test(chatId)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid chatId" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const lastEventIdHeader = request.headers.get("last-event-id");
    const resumeId =
        lastEventIdHeader && STREAM_ID_RE.test(lastEventIdHeader)
            ? lastEventIdHeader
            : null;

    const redis = createRedisStreamReader();
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const safeEnqueue = (chunk: Uint8Array) => {
                if (closed) return;
                try {
                    controller.enqueue(chunk);
                } catch {
                    closed = true;
                }
            };

            const cleanup = async () => {
                if (closed) return;
                closed = true;
                try {
                    await redis.quit();
                } catch {
                    redis.disconnect();
                }
                try {
                    controller.close();
                } catch {
                    // Already closed.
                }
            };

            request.signal.addEventListener("abort", () => {
                void cleanup();
            });

            const forwardMatching = (entries: DoclingStreamEntry[]) => {
                for (const { id, event } of entries) {
                    if (event.session_id !== chatId) continue;
                    safeEnqueue(sseFrame("docling", event, id));
                }
            };

            let lastId = resumeId ?? "$";

            try {
                safeEnqueue(
                    sseFrame("connected", {
                        chatId,
                        stream: STREAM_RESULT_KEY,
                        resumeFrom: resumeId,
                    }),
                );

                if (!resumeId) {
                    // Fresh connect: replay recent history for this chat, then
                    // live-follow from the newest scanned id (or "$" if empty).
                    const { entries, newestId } = await readDoclingHistory(redis);
                    if (newestId) lastId = newestId;
                    forwardMatching(entries);
                }

                // Live loop: block up to 15s, emit ping on idle so proxies
                // and EventSource stay alive, then XREAD again.
                while (!closed && !request.signal.aborted) {
                    const entries = await readDoclingLive(redis, lastId, 15_000);
                    if (closed || request.signal.aborted) break;

                    if (entries.length === 0) {
                        safeEnqueue(sseFrame("ping", { t: Date.now() }));
                        continue;
                    }

                    lastId = entries[entries.length - 1]!.id;
                    forwardMatching(entries);
                }
            } catch (err) {
                if (!closed && !request.signal.aborted) {
                    const message =
                        err instanceof Error ? err.message : "Redis stream read failed";
                    safeEnqueue(sseFrame("bridge-error", { error: message }));
                }
            } finally {
                await cleanup();
            }
        },
        cancel() {
            closed = true;
            void redis.quit().catch(() => redis.disconnect());
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Disable nginx-style proxy buffering if present in front of Next.
            "X-Accel-Buffering": "no",
        },
    });
}
