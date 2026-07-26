"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { confirmTwoFactorSetupAction, verifyTwoFactorAction } from "@/lib/auth/actions"
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
import { Shield01Icon, ArrowLeft01Icon, QrCodeIcon } from "@hugeicons/core-free-icons"
import Image from "next/image"

type Mode = "verify" | "setup" | "scan"

export default function TwoFactorPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("verify")
  const [qr, setQr] = useState<string | null>(null)
  const [otpauth, setOtpauth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (mode !== "scan") return
    fetch("/api/2fa/setup", { method: "POST" })
      .then((r) => r.json())
      .then((data: { ok: boolean; qrDataUrl?: string; otpauthUrl?: string; error?: string }) => {
        if (data.ok && data.qrDataUrl) {
          setQr(data.qrDataUrl)
          setOtpauth(data.otpauthUrl ?? null)
        } else {
          setError(data.error ?? "Unable to start 2FA setup.")
          setMode("verify")
        }
      })
      .catch(() => {
        setError("Network error while starting 2FA setup.")
        setMode("verify")
      })
  }, [mode])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const action = mode === "scan" ? confirmTwoFactorSetupAction : verifyTwoFactorAction
      const result = await action(null, fd)
      if (result.ok) {
        router.push("/chat")
        router.refresh()
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
            <HugeiconsIcon icon={mode === "scan" ? QrCodeIcon : Shield01Icon} className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">
            {mode === "scan" ? "Scan the QR code" : "Two-factor authentication"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "scan"
              ? "Scan with Google Authenticator, 1Password, Authy, or any TOTP app."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>

        {qr && mode === "scan" && (
          <div className="rounded-lg border bg-card p-4 flex flex-col items-center gap-3">
            <div className="rounded bg-white p-2">
              <Image src={qr} alt="2FA QR code" width={192} height={192} unoptimized />
            </div>
            {otpauth && (
              <code className="text-[10px] text-muted-foreground break-all text-center">{otpauth}</code>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="code">Verification code</FieldLabel>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                required
              />
              <FieldDescription>
                {mode === "scan"
                  ? "After scanning, enter the 6 digits shown in your app."
                  : "Open your authenticator app to find the code."}
              </FieldDescription>
            </Field>
          </FieldGroup>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Verifying…" : mode === "scan" ? "Confirm and enable" : "Verify and sign in"}
          </Button>
        </form>

        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => router.push("/auth/login")}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" /> Back to sign in
          </button>
          {mode === "verify" && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setMode("scan")}
            >
              Set up 2FA
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
