import "server-only"
import { cookies } from "next/headers"
import { getIronSession, type IronSession, type SessionOptions } from "iron-session"

export type AuthSession = {
  userId?: string
  email?: string
  // pending 2FA — the user passed email+password but not the TOTP code yet
  pending2faUserId?: string
  // flash for verify-email / password-reset links
  flash?: { kind: "verify-email" | "reset-password"; userId: string } | null
}

const SECRET = process.env.AUTH_SECRET
if (!SECRET || SECRET.length < 32) {
  throw new Error("AUTH_SECRET must be set and at least 32 characters in .env.local")
}

export const sessionOptions: SessionOptions = {
  password: SECRET,
  cookieName: "tobu_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

export async function getSession(): Promise<IronSession<AuthSession>> {
  const cookieStore = await cookies()
  return getIronSession<AuthSession>(cookieStore, sessionOptions)
}
