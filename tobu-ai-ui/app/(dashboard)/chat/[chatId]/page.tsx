import Wizard from "@/components/wizerd/wizerd"
import { ensureUserChat } from "@/lib/chat/ensure-user-chat"
import { notFound } from "next/navigation"

const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export default async function WizardPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  if (!CHAT_ID_RE.test(chatId)) notFound()

  await ensureUserChat(chatId)

  return <Wizard />
}
