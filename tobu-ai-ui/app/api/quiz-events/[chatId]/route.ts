import {
    createRedisStreamReader,
    QUIZ_AGENT_STREAM,
    readQuizHistory,
    readQuizLive,
    type QuizStreamEntry,
} from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STREAM_ID_RE = /^\d+-\d+$/;

const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown, id?: string): Uint8Array {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    const idLine = id ? `id: ${id}\n` : "";
    return encoder.encode(`${idLine}event: ${event}\ndata: ${payload}\n\n`);
}

/**
 * SSE bridge: browser EventSource → Redis stream `quiz_agent_bus`.
 *
 * Quiz LangGraph agents (LiveKit / QG / AA) XADD events with a `chatId`
 * matching the LiveKit room slug from `/chat/[chatId]/live`.
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

            const forwardMatching = (entries: QuizStreamEntry[]) => {
                for (const { id, event } of entries) {
                    if (event.chatId !== chatId) continue;
                    safeEnqueue(sseFrame("quiz", event, id));
                }
            };

            let lastId = resumeId ?? "$";

            try {
                safeEnqueue(
                    sseFrame("connected", {
                        chatId,
                        stream: QUIZ_AGENT_STREAM,
                        resumeFrom: resumeId,
                    }),
                );

                if (!resumeId) {
                    const { entries, newestId } = await readQuizHistory(redis);
                    if (newestId) lastId = newestId;
                    forwardMatching(entries);
                }

                while (!closed && !request.signal.aborted) {
                    const entries = await readQuizLive(redis, lastId, 15_000);
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
                        err instanceof Error ? err.message : "quiz stream error";
                    safeEnqueue(sseFrame("error", { error: message }));
                }
            } finally {
                await cleanup();
            }
        },
        cancel() {
            closed = true;
            try {
                redis.disconnect();
            } catch {
                // ignore
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
