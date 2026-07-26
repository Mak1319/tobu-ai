import { NextResponse } from "next/server"
import { loginAction } from "@/lib/auth/actions"

// loginAction ends in a redirect() on success, which throws NEXT_REDIRECT.
// We need to let that throw — don't wrap the call in try/catch.
export async function POST(request: Request) {
  const body = await request.formData().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 })
  const result = await loginAction(null, body)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
