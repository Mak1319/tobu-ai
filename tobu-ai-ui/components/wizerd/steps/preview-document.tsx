"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MarkdownPreview } from "./markdown-preview";
import type { NavigationPayload, NavigationResult } from "@stepperize/react";

interface PreviewDocumentPageProps {
    next: (
        payload?: NavigationPayload | undefined,
    ) => Promise<NavigationResult>;
}

/** Mirrors the JSON the document-worker writes to the `docling_results` stream. */
type DoclingResultEvent = {
    session_id: string | null;
    status: "processed" | "skipped" | "error" | string;
    file_key: string;
    md_key?: string;
    sha256?: string;
    markdown_chars?: number;
    error?: string;
};

type PreviewPhase =
    "connecting" | "waiting" | "loading" | "ready" | "error" | "disconnected";

/**
 * Stream markdown body from `/api/processed/[mdKey]` (MinIO → Next → browser).
 * Appends chunks as they arrive so large docs paint progressively.
 */
async function streamMarkdown(
    mdKey: string,
    signal: AbortSignal,
    onChunk: (text: string) => void,
): Promise<void> {
    const res = await fetch(`/api/processed/${encodeURIComponent(mdKey)}`, {
        signal,
    });

    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(
            body?.error ?? `Failed to load preview (${res.status})`,
        );
    }

    if (!res.body) {
        const text = await res.text();
        onChunk(text);
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
    }
    // Flush any trailing multibyte sequence.
    const tail = decoder.decode();
    if (tail) onChunk(tail);
}

export default function PreviewDocument({ next }: PreviewDocumentPageProps) {
    const params = useParams();
    const chatId = params.chatId as string;

    const [phase, setPhase] = useState<PreviewPhase>("connecting");
    const [statusLabel, setStatusLabel] = useState("Connecting to worker…");
    const [result, setResult] = useState<DoclingResultEvent | null>(null);
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!chatId) return;

        const es = new EventSource(
            `/api/worker-events/${encodeURIComponent(chatId)}`,
        );
        let closed = false;
        let settled = false;
        const seen = new Set<string>();
        let fetchAbort: AbortController | null = null;

        const close = () => {
            if (closed) return;
            closed = true;
            es.close();
            fetchAbort?.abort();
        };

        const loadMarkdown = async (mdKey: string) => {
            fetchAbort?.abort();
            fetchAbort = new AbortController();
            const { signal } = fetchAbort;

            setPhase("loading");
            setStatusLabel("Streaming markdown preview…");
            setMarkdown("");

            try {
                let gotChunk = false;
                await streamMarkdown(mdKey, signal, (chunk) => {
                    if (signal.aborted) return;
                    setMarkdown((prev) => (prev ?? "") + chunk);
                    if (!gotChunk) {
                        gotChunk = true;
                        setStatusLabel("Streaming document…");
                    }
                });
                if (signal.aborted) return;
                setPhase("ready");
                setStatusLabel("Document ready");
                setError(null);
            } catch (err) {
                if (signal.aborted) return;
                setPhase("error");
                setStatusLabel("Preview failed");
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not load processed markdown",
                );
            }
        };

        es.addEventListener("connected", () => {
            if (settled) return;
            setPhase("waiting");
            setStatusLabel("Waiting for document worker…");
            setError(null);
        });

        es.addEventListener("docling", (ev) => {
            try {
                const data = JSON.parse(ev.data) as DoclingResultEvent;
                const dedupeKey = `${data.file_key}:${data.status}`;
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                setResult(data);

                if (data.status === "error") {
                    settled = true;
                    setPhase("error");
                    setStatusLabel("Processing failed");
                    setError(data.error ?? "Worker reported an error");
                    return;
                }

                // processed | skipped — markdown is ready in processed-documents.
                settled = true;
                setStatusLabel(
                    data.status === "skipped"
                        ? "Already processed (cached)"
                        : "Document processed",
                );
                setError(null);

                if (!data.md_key) {
                    setPhase("error");
                    setStatusLabel("Missing markdown key");
                    setError("Worker finished without an md_key");
                    return;
                }

                void loadMarkdown(data.md_key);
            } catch {
                setPhase("error");
                setStatusLabel("Bad event payload");
                setError("Could not parse worker event");
            }
        });

        es.addEventListener("bridge-error", (ev) => {
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
        });

        es.onerror = () => {
            if (settled) return;
            if (es.readyState === EventSource.CLOSED) {
                setPhase("disconnected");
                setStatusLabel("Disconnected from worker stream");
                close();
            } else {
                setPhase("connecting");
                setStatusLabel("Reconnecting…");
            }
        };

        return () => {
            close();
        };
    }, [chatId]);

    const showSkeleton =
        (phase === "connecting" ||
            phase === "waiting" ||
            phase === "loading") &&
        !(markdown && markdown.length > 0);
    const showMarkdown =
        markdown != null &&
        markdown.length > 0 &&
        (phase === "loading" || phase === "ready");
    const canContinue =
        phase === "ready" && markdown != null && markdown.length > 0;

    return (
        <div className="flex justify-center  overflow-hidden no-scrollbar">
            <div className="flex   flex-col gap-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">
                            Preview document
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {statusLabel}
                        </p>
                    </div>
                    <Badge
                        variant={
                            phase === "ready"
                                ? "default"
                                : phase === "error"
                                  ? "destructive"
                                  : "secondary"
                        }
                    >
                        {phase}
                    </Badge>
                </div>

                <div className="overflow-scroll no-scrollbar ">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Document preview
                        </span>
                        {result?.md_key && (
                            <span className="truncate font-mono text-xs text-muted-foreground">
                                {result.md_key}
                            </span>
                        )}
                    </div>

                    <ScrollArea className="h-[min(60vh,25rem)] ">
                        <div className="space-y-3 p-4">
                            {showSkeleton && <MarkdownViewerSkeleton />}

                            {phase === "error" && (
                                <p
                                    className="text-sm text-destructive"
                                    role="alert"
                                >
                                    {error ??
                                        "Something went wrong while loading the preview."}
                                </p>
                            )}

                            {phase === "disconnected" && (
                                <p className="text-sm text-muted-foreground">
                                    Lost the worker event stream. Refresh or
                                    re-upload to try again.
                                </p>
                            )}

                            {showMarkdown && (
                                <MarkdownPreview content={markdown} />
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <div className="flex justify-end">
                    <Button onClick={() => next()} disabled={!canContinue}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}

function MarkdownViewerSkeleton() {
    return (
        <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Loading markdown preview"
        >
            <Skeleton className="h-6 w-1/2 rounded-md" />
            <Skeleton className="h-3 w-full rounded-md" />
            <Skeleton className="h-3 w-11/12 rounded-md" />
            <Skeleton className="h-3 w-4/5 rounded-md" />
            <Skeleton className="mt-4 h-3 w-full rounded-md" />
            <Skeleton className="h-3 w-5/6 rounded-md" />
            <Skeleton className="h-3 w-3/4 rounded-md" />
            <Skeleton className="mt-4 h-24 w-full rounded-lg" />
            <Skeleton className="h-3 w-2/3 rounded-md" />
            <Skeleton className="h-3 w-full rounded-md" />
            <Skeleton className="h-3 w-4/5 rounded-md" />
        </div>
    );
}
