import { NextResponse } from "next/server"
import { startTwoFactorSetupAction } from "@/lib/auth/actions"

export async function POST() {
  const result = await startTwoFactorSetupAction()
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
