"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MarkdownPreview } from "./markdown-preview";
import type { NavigationPayload, NavigationResult } from "@stepperize/react";
import { readWizardHash, writeWizardHash } from "@/lib/wizard/storage";

interface PreviewDocumentPageProps {
    next: (
        payload?: NavigationPayload | undefined,
    ) => Promise<NavigationResult>;
}

type PreviewPhase = "resolving" | "loading" | "ready" | "error";

/**
 * Stream markdown from `/api/processed/[mdKey]` (MinIO processed-documents).
 * Called after upload step confirmed topicable finished via Redis stream.
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
        onChunk(await res.text());
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
}

async function resolveFileHash(chatId: string): Promise<{
    fileHash: string;
    mdKey: string;
} | null> {
    const stored = readWizardHash(chatId);
    if (stored?.fileHash) {
        return {
            fileHash: stored.fileHash,
            mdKey: stored.mdKey ?? `${stored.fileHash}.md`,
        };
    }

    const res = await fetch(`/api/uploads/${encodeURIComponent(chatId)}/hash`);
    const data = (await res.json().catch(() => null)) as
        | { ok: true; contentHash: string; mdKey?: string | null }
        | { ok: false }
        | null;
    if (!res.ok || !data || !data.ok) return null;

    const mdKey = data.mdKey ?? `${data.contentHash}.md`;
    writeWizardHash(chatId, { fileHash: data.contentHash, mdKey });
    return { fileHash: data.contentHash, mdKey };
}

export default function PreviewDocument({ next }: PreviewDocumentPageProps) {
    const params = useParams();
    const chatId = params.chatId as string;

    const [phase, setPhase] = useState<PreviewPhase>("resolving");
    const [statusLabel, setStatusLabel] = useState(
        "Loading processed document…",
    );
    const [mdKey, setMdKey] = useState<string | null>(null);
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!chatId) return;

        let cancelled = false;
        const abort = new AbortController();

        const run = async () => {
            setPhase("resolving");
            setStatusLabel("Resolving file hash…");
            setError(null);

            const resolved = await resolveFileHash(chatId);
            if (cancelled) return;

            if (!resolved) {
                setPhase("error");
                setStatusLabel("Missing file hash");
                setError(
                    "No processed document hash. Re-open this chat after upload processing finishes, or start a new chat.",
                );
                return;
            }

            setMdKey(resolved.mdKey);
            writeWizardHash(chatId, {
                fileHash: resolved.fileHash,
                mdKey: resolved.mdKey,
            });

            setPhase("loading");
            setStatusLabel("Streaming markdown preview…");
            setMarkdown("");

            try {
                let gotChunk = false;
                await streamMarkdown(resolved.mdKey, abort.signal, (chunk) => {
                    if (cancelled) return;
                    setMarkdown((prev) => (prev ?? "") + chunk);
                    if (!gotChunk) {
                        gotChunk = true;
                        setStatusLabel("Streaming document…");
                    }
                });
                if (cancelled || abort.signal.aborted) return;
                setPhase("ready");
                setStatusLabel("Document ready");
                setError(null);
            } catch (err) {
                if (cancelled || abort.signal.aborted) return;
                setPhase("error");
                setStatusLabel("Preview failed");
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not load processed markdown",
                );
                if (resolved.mdKey) {
                    setStatusLabel(`Missing ${resolved.mdKey}`);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
            abort.abort();
        };
    }, [chatId]);

    const showSkeleton =
        (phase === "resolving" || phase === "loading") &&
        !(markdown && markdown.length > 0);
    const showMarkdown =
        markdown != null &&
        markdown.length > 0 &&
        (phase === "loading" || phase === "ready");
    const canContinue =
        phase === "ready" && markdown != null && markdown.length > 0;

    return (
        <div className="mx-auto flex h-[min(100%,calc(100dvh-8rem))] min-h-0 w-full max-w-3xl flex-col gap-4">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground">
                        Preview document
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
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

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Document preview
                    </span>
                    {mdKey && (
                        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                            {mdKey}
                        </span>
                    )}
                </div>

                <ScrollArea className="h-0 min-h-0 flex-1">
                    <div className="space-y-3 p-4 break-words [overflow-wrap:anywhere]">
                        {showSkeleton && <MarkdownViewerSkeleton />}

                        {phase === "error" && (
                            <p
                                className="text-sm break-words text-destructive"
                                role="alert"
                            >
                                {error ??
                                    "Something went wrong while loading the preview."}
                            </p>
                        )}

                        {showMarkdown && (
                            <MarkdownPreview
                                content={markdown}
                                className="min-w-0 break-words [overflow-wrap:anywhere]"
                            />
                        )}
                    </div>
                </ScrollArea>
            </div>

            <div className="flex shrink-0 justify-end pb-2">
                <Button onClick={() => void next()} disabled={!canContinue}>
                    Next — select topics
                </Button>
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
