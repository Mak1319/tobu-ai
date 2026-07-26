import { NextResponse } from "next/server"
import { logoutAction } from "@/lib/auth/actions"

export async function POST() {
  await logoutAction()
  return NextResponse.json({ ok: true })
}
