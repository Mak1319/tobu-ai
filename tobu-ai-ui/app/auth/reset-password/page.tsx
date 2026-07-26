"use client"

import { useState, useTransition } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { resetPasswordAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function ResetPasswordPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const token = sp.get("token") ?? ""
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set("token", token)
    startTransition(async () => {
      const result = await resetPasswordAction(null, fd)
      if (result.ok) {
        router.push("/auth/login?reset=1")
      } else {
        setError(result.error)
      }
    })
  }

  if (!token) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
        <Alert variant="destructive"><AlertDescription>Invalid reset link.</AlertDescription></Alert>
        <Link className="text-sm underline" href="/auth/forgot-password">Request a new one</Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-center">Choose a new password</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input id="password" name="password" type="password" minLength={8} required />
              <FieldDescription>At least 8 characters.</FieldDescription>
            </Field>
          </FieldGroup>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button>
        </form>
      </div>
    </div>
  )
}
