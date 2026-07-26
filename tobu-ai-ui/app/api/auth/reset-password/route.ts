import { NextResponse } from "next/server"
import { resetPasswordAction } from "@/lib/auth/actions"

export async function POST(request: Request) {
  const body = await request.formData().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 })
  const result = await resetPasswordAction(null, body)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
