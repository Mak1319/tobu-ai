import { NextResponse } from "next/server"
import { Readable } from "node:stream"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import {
  BUCKET,
  buildObjectKey,
  ensureBucket,
  minioClient,
} from "@/lib/minio"
import { connectToDatabase, UploadedFile } from "@/lib/db/models"

export const runtime = "nodejs"

// Allowed content types for uploaded documents. Mirrors the picker on the
// client so server-side validation is the source of truth.
const ALLOWED_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
])

// 10 MB hard cap, matching the UI hint in file-upload-05.tsx.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// chatId is used as a key prefix, so reject anything that isn't a safe
// slug to prevent directory-traversal style keys like "../../etc".
const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 })
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return badRequest("Invalid multipart/form-data body")
  }

  const chatId = formData.get("chatId")
  const fileEntry = formData.get("file")

  if (typeof chatId !== "string" || !CHAT_ID_RE.test(chatId)) {
    return badRequest("Missing or invalid chatId")
  }

  if (!(fileEntry instanceof File)) {
    return badRequest("Missing file")
  }

  const contentType = fileEntry.type
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return badRequest(
      "Only image and PDF files are accepted (PNG, JPG, WEBP, GIF, PDF)."
    )
  }

  if (fileEntry.size === 0) {
    return badRequest("File is empty")
  }

  if (fileEntry.size > MAX_UPLOAD_BYTES) {
    return badRequest("File exceeds the 10 MB limit")
  }

  const key = buildObjectKey(chatId, fileEntry.name)
  const uploadedAt = new Date()

  try {
    await ensureBucket()
    // The stdlib ReadableStream's type and @types/node's ReadableStream type
    // disagree on what a "ReadableStream" is. The runtime call is correct;
    // the cast bridges the type-only mismatch.
    const stream = Readable.fromWeb(
      fileEntry.stream() as unknown as NodeReadableStream<Uint8Array>
    )
    await minioClient.putObject(
      BUCKET,
      key,
      stream,
      fileEntry.size,
      { "Content-Type": contentType }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upload error"
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${message}` },
      { status: 500 }
    )
  }

  // MinIO succeeded. Now persist the metadata so the upload is queryable.
  // Order matters: we never write a dangling row if MinIO failed above,
  // and we surface a 500 if the metadata write fails so the operator can
  // reconcile the orphan object rather than discovering the mismatch later.
  let recordId: string
  try {
    await connectToDatabase()
    const record = await UploadedFile.create({
      chatId,
      bucket: BUCKET,
      key,
      filename: fileEntry.name,
      contentType,
      size: fileEntry.size,
      uploadedAt,
    })
    recordId = record._id.toString()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown metadata error"
    return NextResponse.json(
      {
        ok: false,
        error: `Upload saved to storage but metadata failed: ${message}`,
      },
      { status: 500 }
    )
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
      uploadedAt: uploadedAt.toISOString(),
    },
    { status: 200 }
  )
}