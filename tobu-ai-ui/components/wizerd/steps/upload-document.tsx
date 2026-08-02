"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import FileUpload05 from "@/components/file-upload-05";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { NavigationPayload, NavigationResult } from "@stepperize/react";
import { writeWizardHash } from "@/lib/wizard/storage";

interface Step1PageProps {
    next: (
        payload?: NavigationPayload | undefined,
    ) => Promise<NavigationResult>;
}

type Phase =
    "idle" | "uploaded" | "waiting_worker" | "ready" | "error" | "timeout";

type DoclingResultEvent = {
    session_id: string | null;
    status: string;
    file_key: string;
    md_key?: string;
    sha256?: string;
    error?: string;
};

/** Canonical Redis result stream (topicable XADD → UI SSE). */
const DOCLING_STREAM_LABEL = "docling_result";

/** Stop waiting for a matching session_id event after this long. */
const LISTEN_TIMEOUT_MS = 5 * 60 * 1000;

function isWorkerSuccess(status: string): boolean {
    return (
        status === "success" ||
        status === "partial" ||
        status === "processed" ||
        status === "skipped" ||
        status === "cached"
    );
}

async function patchStudy(
    chatId: string,
    body: Record<string, unknown>,
): Promise<void> {
    await fetch(`/api/chat/${encodeURIComponent(chatId)}/study`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }).catch(() => undefined);
}

function formatRemain(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function Step1Page({ next }: Step1PageProps) {
    const params = useParams();
    const chatId = params.chatId as string;

    const [phase, setPhase] = useState<Phase>("idle");
    const [statusLabel, setStatusLabel] = useState(
        "Upload a document to begin",
    );
    const [error, setError] = useState<string | null>(null);
    const [remainMs, setRemainMs] = useState<number | null>(null);

    const pendingHashRef = useRef<string | null>(null);
    const advancedRef = useRef(false);
    const esRef = useRef<EventSource | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const deadlineRef = useRef<number | null>(null);

    const clearTimers = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
        deadlineRef.current = null;
        setRemainMs(null);
    }, []);

    const cleanupEs = useCallback(() => {
        esRef.current?.close();
        esRef.current = null;
    }, []);

    const stopListening = useCallback(() => {
        clearTimers();
        cleanupEs();
    }, [clearTimers, cleanupEs]);

    const advance = useCallback(
        async (fileHash: string, mdKey: string) => {
            if (advancedRef.current) return;
            advancedRef.current = true;
            stopListening();

            writeWizardHash(chatId, { fileHash, mdKey });
            await patchStudy(chatId, {
                status: "processed",
                fileHash,
                mdKey,
            });

            setPhase("ready");
            setStatusLabel("Document processed — continuing…");
            await next();
        },
        [chatId, next, stopListening],
    );

    const failTimeout = useCallback(() => {
        if (advancedRef.current) return;
        advancedRef.current = true;
        stopListening();
        setPhase("timeout");
        setStatusLabel("Timed out waiting for worker");
        setError(
            `No matching event on Redis stream ${DOCLING_STREAM_LABEL} for session/chatId “${chatId}” within 5 minutes.`,
        );
        void patchStudy(chatId, {
            status: "failed",
            fileHash: pendingHashRef.current ?? undefined,
            processingError: "worker stream timeout (5m)",
        });
    }, [chatId, stopListening]);

    const startWorkerListen = useCallback(
        (contentHash: string, mdKeyHint: string) => {
            stopListening();
            pendingHashRef.current = contentHash;
            advancedRef.current = false;
            setPhase("waiting_worker");
            setStatusLabel(
                `Listening on ${DOCLING_STREAM_LABEL} for session ${chatId}…`,
            );
            setError(null);

            void patchStudy(chatId, {
                status: "processing",
                fileHash: contentHash,
                mdKey: mdKeyHint,
            });

            // 5-minute listen window
            const deadline = Date.now() + LISTEN_TIMEOUT_MS;
            deadlineRef.current = deadline;
            setRemainMs(LISTEN_TIMEOUT_MS);
            timeoutRef.current = setTimeout(() => {
                failTimeout();
            }, LISTEN_TIMEOUT_MS);
            tickRef.current = setInterval(() => {
                if (!deadlineRef.current) return;
                setRemainMs(Math.max(0, deadlineRef.current - Date.now()));
            }, 1000);

            // SSE bridge reads Redis stream docling_results and only forwards
            // entries whose session_id === chatId.
            const es = new EventSource(
                `/api/worker-events/${encodeURIComponent(chatId)}`,
            );
            esRef.current = es;

            es.addEventListener("connected", (ev) => {
                try {
                    const data = JSON.parse((ev as MessageEvent).data) as {
                        stream?: string;
                    };
                    const streamName = data.stream ?? DOCLING_STREAM_LABEL;
                    setStatusLabel(
                        `SSE connected — watching ${streamName} for session ${chatId}…`,
                    );
                } catch {
                    setStatusLabel(
                        `SSE connected — watching ${DOCLING_STREAM_LABEL}…`,
                    );
                }
            });

            es.addEventListener("docling", (ev) => {
                try {
                    const data = JSON.parse(
                        (ev as MessageEvent).data,
                    ) as DoclingResultEvent;

                    // Server already filters by session_id === chatId; double-check.
                    if (data.session_id && data.session_id !== chatId) {
                        return;
                    }

                    // Prefer matching the upload we just sent when hash is present.
                    if (
                        data.sha256 &&
                        pendingHashRef.current &&
                        data.sha256.toLowerCase() !==
                            pendingHashRef.current.toLowerCase()
                    ) {
                        return;
                    }

                    if (data.status === "error") {
                        if (advancedRef.current) return;
                        advancedRef.current = true;
                        stopListening();
                        setPhase("error");
                        setStatusLabel("Processing failed");
                        setError(data.error ?? "Worker reported an error");
                        void patchStudy(chatId, {
                            status: "failed",
                            fileHash: pendingHashRef.current ?? undefined,
                            processingError: data.error ?? "processing failed",
                        });
                        return;
                    }

                    if (!isWorkerSuccess(data.status)) return;

                    const fileHash =
                        data.sha256 ?? pendingHashRef.current ?? contentHash;
                    const mdKey = data.md_key ?? `${fileHash}.md`;
                    void advance(fileHash, mdKey);
                } catch {
                    if (advancedRef.current) return;
                    setPhase("error");
                    setStatusLabel("Bad worker event");
                    setError("Could not parse worker stream event");
                    stopListening();
                }
            });

            es.addEventListener("bridge-error", (ev) => {
                if (advancedRef.current) return;
                const messageEvent = ev as MessageEvent<string>;
                try {
                    const data = JSON.parse(messageEvent.data) as {
                        error?: string;
                    };
                    setError(data.error ?? "SSE bridge error");
                } catch {
                    setError(messageEvent.data || "SSE bridge error");
                }
                setPhase("error");
                setStatusLabel("Stream error");
                stopListening();
            });

            es.onerror = () => {
                if (advancedRef.current) return;
                // EventSource auto-reconnects on transient errors; only fail
                // hard if the socket is closed permanently before timeout.
                if (es.readyState === EventSource.CLOSED) {
                    setPhase("error");
                    setStatusLabel("Disconnected from worker stream");
                    setError(
                        "Lost Redis stream SSE connection. Re-upload to try again.",
                    );
                    stopListening();
                } else {
                    setStatusLabel(`Reconnecting to ${DOCLING_STREAM_LABEL}…`);
                }
            };
        },
        [advance, chatId, failTimeout, stopListening],
    );

    useEffect(() => () => stopListening(), [stopListening]);

    const waiting =
        phase === "uploaded" || phase === "waiting_worker" || phase === "ready";

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <FileUpload05
                chatId={chatId}
                disabled={waiting}
                onUploadComplete={({ contentHash, mdKey }) => {
                    setPhase("uploaded");
                    setStatusLabel(
                        "Upload complete — opening stream listener…",
                    );
                    writeWizardHash(chatId, { fileHash: contentHash, mdKey });
                    void patchStudy(chatId, {
                        status: "uploaded",
                        fileHash: contentHash,
                        mdKey,
                    });
                    startWorkerListen(contentHash, mdKey);
                }}
            />

            {phase !== "idle" && (
                <div className="flex w-full max-w-lg flex-col gap-2 px-10">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                            {statusLabel}
                        </p>
                        <Badge
                            variant={
                                phase === "ready"
                                    ? "default"
                                    : phase === "error" || phase === "timeout"
                                      ? "destructive"
                                      : "secondary"
                            }
                        >
                            {phase}
                        </Badge>
                    </div>
                    {(phase === "waiting_worker" || phase === "uploaded") && (
                        <div className="space-y-2" aria-busy="true">
                            <Skeleton className="h-2 w-full rounded-full" />
                            <p className="text-xs text-muted-foreground">
                                Matching Redis stream{" "}
                                <code className="font-mono">
                                    {DOCLING_STREAM_LABEL}
                                </code>{" "}
                                by <code className="font-mono">session_id</code>{" "}
                                = <code className="font-mono">{chatId}</code>.
                                On match, SSE notifies this page and the wizard
                                advances.
                                {remainMs != null && (
                                    <>
                                        {" "}
                                        Timeout in{" "}
                                        <span className="font-mono">
                                            {formatRemain(remainMs)}
                                        </span>
                                        .
                                    </>
                                )}
                            </p>
                        </div>
                    )}
                    {(phase === "error" || phase === "timeout") && error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
