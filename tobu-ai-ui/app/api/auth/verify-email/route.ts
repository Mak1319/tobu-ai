import { NextResponse } from "next/server"
import { verifyEmailAction } from "@/lib/auth/actions"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 })
  const result = await verifyEmailAction(token)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
