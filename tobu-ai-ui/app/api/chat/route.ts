import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ensureUserChat } from "@/lib/chat/ensure-user-chat"
import { getSession } from "@/lib/auth/session"

export const runtime = "nodejs"

const Body = z.object({
  chatId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  title: z.string().trim().min(1).max(120).optional(),
})

/**
 * POST /api/chat
 * Create (or register) a chat for the signed-in user.
 * If chatId is omitted, a UUID is generated server-side.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown = {}
  try {
    const text = await request.text()
    if (text) payload = JSON.parse(text)
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = Body.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    )
  }

  const chatId = parsed.data.chatId ?? crypto.randomUUID()
  const result = await ensureUserChat(chatId, parsed.data.title ?? "New chat")
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error === "Unauthorized" ? 401 : 400 },
    )
  }

  if (result.created) {
    revalidatePath("/", "layout")
  }

  return NextResponse.json({ ok: true, chatId })
}
