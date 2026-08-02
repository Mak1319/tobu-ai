import "server-only"

import { getSession } from "@/lib/auth/session"
import { connectToDatabase, User } from "@/lib/db/models"

const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Persist a chatId on the signed-in user (idempotent).
 * Called when a chat session page is opened or via POST /api/chat.
 */
export async function ensureUserChat(
  chatId: string,
  title = "New chat",
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  if (!CHAT_ID_RE.test(chatId)) {
    return { ok: false, error: "Invalid chatId" }
  }

  const session = await getSession()
  if (!session.userId) {
    return { ok: false, error: "Unauthorized" }
  }

  await connectToDatabase()

  const result = await User.updateOne(
    { _id: session.userId, "chats.chatId": { $ne: chatId } },
    {
      $push: {
        chats: {
          $each: [
            {
              chatId,
              title,
              createdAt: new Date(),
            },
          ],
          $position: 0,
        },
      },
    },
  )

  return { ok: true, created: result.modifiedCount > 0 }
}
