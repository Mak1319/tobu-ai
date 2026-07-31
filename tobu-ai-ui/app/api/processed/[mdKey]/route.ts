import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { minioClient, PROCESSED_BUCKET } from "@/lib/minio";

export const runtime = "nodejs";

// Worker stores processed markdown as `<sha256>.md`.
const MD_KEY_RE = /^[a-f0-9]{64}\.md$/i;

/**
 * Stream processed Docling markdown from the processed-documents bucket.
 * The preview step calls this after the Redis/SSE `docling` event provides `md_key`.
 */
export async function GET(
    _request: Request,
    context: { params: Promise<{ mdKey: string }> },
) {
    const { mdKey: rawKey } = await context.params;
    const mdKey = decodeURIComponent(rawKey);

    if (!MD_KEY_RE.test(mdKey)) {
        return NextResponse.json(
            { ok: false, error: "Invalid markdown key" },
            { status: 400 },
        );
    }

    try {
        const objectStream = await minioClient.getObject(
            PROCESSED_BUCKET,
            mdKey,
        );

        // MinIO returns a Node.js Readable; pipe it straight to the HTTP response.
        const webStream = Readable.toWeb(
            objectStream as Readable,
        ) as ReadableStream<Uint8Array>;

        return new Response(webStream, {
            status: 200,
            headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Cache-Control": "private, max-age=60",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (err) {
        const code =
            err && typeof err === "object" && "code" in err
                ? String((err as { code?: string }).code)
                : "";
        if (code === "NoSuchKey" || code === "NotFound") {
            return NextResponse.json(
                { ok: false, error: "Processed document not found" },
                { status: 404 },
            );
        }
        const message =
            err instanceof Error
                ? err.message
                : "Failed to read processed document";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
