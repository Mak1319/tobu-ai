"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"

export default function ChatPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const handleNewChat = () => {
    startTransition(async () => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { ok?: boolean; chatId?: string; error?: string }
      if (!res.ok || !data.ok || !data.chatId) {
        console.error(data.error ?? "Failed to create chat")
        return
      }
      router.push(`/chat/${data.chatId}`)
      router.refresh()
    })
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <EmptyState onNewChat={handleNewChat} pending={pending} />
    </div>
  )
}

function EmptyState({
  onNewChat,
  pending,
}: {
  onNewChat: () => void
  pending: boolean
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full bg-muted p-4">
          <HugeiconsIcon
            icon={Add01Icon}
            className="size-8 text-muted-foreground"
          />
        </div>
        <h2 className="text-lg font-semibold">Start a study chat</h2>
        <p className="max-w-xs text-muted-foreground">
          Start a new conversation to get started with Tobu AI
        </p>
      </div>
      <Button onClick={onNewChat} disabled={pending}>
        <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
        {pending ? "Starting…" : "New Chat"}
      </Button>
    </>
  )
}
