import { NextResponse } from "next/server"
import { connectToDatabase, UploadedFile } from "@/lib/db/models"

export const runtime = "nodejs"

const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * GET /api/uploads/[chatId]/hash
 * Fallback: latest UploadedFile.contentHash for this chat.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await context.params
  if (!CHAT_ID_RE.test(chatId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid chatId" },
      { status: 400 },
    )
  }

  try {
    await connectToDatabase()
    const row = await UploadedFile.findOne({ chatId })
      .sort({ uploadedAt: -1 })
      .select({ contentHash: 1, processedKey: 1, key: 1 })
      .lean()

    const contentHash =
      row && typeof row.contentHash === "string" ? row.contentHash : null
    if (!contentHash) {
      return NextResponse.json(
        { ok: false, error: "No contentHash for this chat" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      chatId,
      contentHash,
      mdKey:
        row && typeof row.processedKey === "string" && row.processedKey
          ? row.processedKey
          : `${contentHash}.md`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
