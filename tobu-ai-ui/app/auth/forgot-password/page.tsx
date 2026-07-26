"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { forgotPasswordAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Mail01Icon } from "@hugeicons/core-free-icons"

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await forgotPasswordAction(null, fd)
      if (result.ok) {
        setSent(true)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-muted p-3">
            <HugeiconsIcon icon={Mail01Icon} className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter the email on your account and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <Alert>
            <AlertDescription>
              If an account exists for that email, a reset link has been sent. Check your inbox.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" required placeholder="m@example.com" />
                <FieldDescription>The link is valid for 60 minutes.</FieldDescription>
              </Field>
            </FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" /> Back to sign in
        </Link>
      </div>
    </div>
  )
}
