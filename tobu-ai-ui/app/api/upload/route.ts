import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { BUCKET, buildObjectKey, ensureBucket, minioClient } from "@/lib/minio";
import { connectToDatabase, UploadedFile } from "@/lib/db/models";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set<string>([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "application/pdf",
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Client-computed SHA-256 hex (Web Crypto). */
const CONTENT_HASH_RE = /^[a-f0-9]{64}$/i;

function badRequest(error: string) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request) {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return badRequest("Invalid multipart/form-data body");
    }

    const chatId = formData.get("chatId");
    const fileEntry = formData.get("file");
    const contentHashRaw = formData.get("contentHash");

    if (typeof chatId !== "string" || !CHAT_ID_RE.test(chatId)) {
        return badRequest("Missing or invalid chatId");
    }

    if (!(fileEntry instanceof File)) {
        return badRequest("Missing file");
    }

    if (
        typeof contentHashRaw !== "string" ||
        !CONTENT_HASH_RE.test(contentHashRaw)
    ) {
        return badRequest(
            "Missing or invalid contentHash (client must send SHA-256 hex)",
        );
    }
    const contentHash = contentHashRaw.toLowerCase();
    const mdKey = `${contentHash}.md`;

    const contentType = fileEntry.type;
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
        return badRequest(
            "Only image and PDF files are accepted (PNG, JPG, WEBP, GIF, PDF).",
        );
    }

    if (fileEntry.size === 0) {
        return badRequest("File is empty");
    }

    if (fileEntry.size > MAX_UPLOAD_BYTES) {
        return badRequest("File exceeds the 10 MB limit");
    }

    const key = buildObjectKey(chatId, fileEntry.name);
    const uploadedAt = new Date();

    try {
        await ensureBucket();
        const stream = Readable.fromWeb(
            fileEntry.stream() as unknown as NodeReadableStream<Uint8Array>,
        );
        // Client hash is trusted as the content id; attach as MinIO metadata
        // so topicable uses processed-documents/<sha256>.md
        await minioClient.putObject(BUCKET, key, stream, fileEntry.size, {
            "Content-Type": contentType,
            "X-Amz-Meta-Session-Id": chatId,
            "X-Amz-Meta-Chat-Id": chatId,
            "X-Amz-Meta-File-Hash": contentHash,
            "X-Amz-Meta-Hash-Id": contentHash,
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown upload error";
        return NextResponse.json(
            { ok: false, error: `Upload failed: ${message}` },
            { status: 500 },
        );
    }

    let recordId: string;
    try {
        await connectToDatabase();
        const record = await UploadedFile.create({
            chatId,
            bucket: BUCKET,
            key,
            filename: fileEntry.name,
            contentType,
            size: fileEntry.size,
            uploadedAt,
            contentHash,
            processingStatus: "pending",
        });
        recordId = record._id.toString();
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown metadata error";
        return NextResponse.json(
            {
                ok: false,
                error: `Upload saved to storage but metadata failed: ${message}`,
            },
            { status: 500 },
        );
    }

    return NextResponse.json(
        {
            ok: true,
            id: recordId,
            key,
            bucket: BUCKET,
            filename: fileEntry.name,
            size: fileEntry.size,
            contentType,
            contentHash,
            mdKey,
            uploadedAt: uploadedAt.toISOString(),
        },
        { status: 200 },
    );
}
