import { NextResponse } from "next/server"
import { findHashContent } from "@/lib/db/hash-content"

export const runtime = "nodejs"

const HASH_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

/**
 * GET /api/hash-content/[hashId]
 *
 * Reads workers/topicable `hashContentMap` by file hash and returns
 * markdownKey + topicGraph for the wizard subject/topic picker.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ hashId: string }> },
) {
  const { hashId: raw } = await context.params
  const hashId = decodeURIComponent(raw ?? "").trim()

  if (!HASH_ID_RE.test(hashId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid hashId" },
      { status: 400 },
    )
  }

  try {
    const doc = await findHashContent(hashId)
    if (!doc) {
      return NextResponse.json(
        { ok: false, error: "Hash content not found" },
        { status: 404 },
      )
    }

    const topicGraph = doc.content.topicGraph
    if (!topicGraph || typeof topicGraph !== "object") {
      return NextResponse.json(
        { ok: false, error: "No topic graph for this hash" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      hashId: doc.hashId,
      content: {
        markdownKey: doc.content.markdownKey ?? null,
        conversionMethod: doc.content.conversionMethod ?? null,
        markdownChars: doc.content.markdownChars ?? null,
        topicGraph,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
