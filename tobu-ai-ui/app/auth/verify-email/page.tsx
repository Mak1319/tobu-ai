"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, AlertCircleIcon, Mail01Icon } from "@hugeicons/core-free-icons"

type State = "loading" | "ok" | "err"

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("loading")
  const [message, setMessage] = useState<string>("")

  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get("token")
    if (!token) {
      setState("err")
      setMessage("Missing verification token.")
      return
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; error?: string }) => {
        if (data.ok) {
          setState("ok")
        } else {
          setState("err")
          setMessage(data.error ?? "This verification link is invalid or has expired.")
        }
      })
      .catch(() => {
        setState("err")
        setMessage("Network error while verifying your email.")
      })
  }, [])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-muted p-3">
          <HugeiconsIcon
            icon={
              state === "ok" ? CheckmarkCircle02Icon : state === "err" ? AlertCircleIcon : Mail01Icon
            }
            className="size-6 text-muted-foreground"
          />
        </div>
        <h1 className="text-xl font-semibold">
          {state === "loading" && "Verifying your email…"}
          {state === "ok" && "Email verified"}
          {state === "err" && "Verification failed"}
        </h1>
        {state === "err" && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        {state === "ok" && (
          <p className="text-sm text-muted-foreground">Your email is now verified. You can sign in.</p>
        )}
        <Button>
          <Link href="/auth/login">Go to sign in</Link>
        </Button>
      </div>
    </div>
  )
}
