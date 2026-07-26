import { NextResponse } from "next/server"
import { forgotPasswordAction } from "@/lib/auth/actions"

export async function POST(request: Request) {
  const body = await request.formData().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 })
  const result = await forgotPasswordAction(null, body)
  return NextResponse.json(result, { status: 200 }) // always 200 — don't leak whether email exists
}
