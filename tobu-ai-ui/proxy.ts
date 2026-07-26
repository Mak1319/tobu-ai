import { NextResponse, type NextRequest } from "next/server"
import { getIronSession } from "iron-session"
import { sessionOptions, type AuthSession } from "@/lib/auth/session"
import { cookies } from "next/headers"

// We can't call `cookies()` from the proxy (it must be edge-compatible and stateless),
// so we read the cookie directly via NextRequest.cookies and decrypt with iron-session's
// unsealData helper.
import { unsealData } from "iron-session"

const PROTECTED = ["/chat", "/settings", "/dashboard"]
const AUTH_PAGES = ["/auth/login", "/auth/signup"]

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const cookie = request.cookies.get("tobu_session")?.value

  let session: AuthSession | null = null
  if (cookie) {
    try {
      session = await unsealData<AuthSession>(cookie, { password: sessionOptions.password })
    } catch {
      session = null
    }
  }

  const isAuthed = Boolean(session?.userId)
  const hasPending2fa = Boolean(session?.pending2faUserId)

  // Block unauthenticated access to protected pages
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !isAuthed) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }

  // If the user has a pending 2FA challenge and tries to go anywhere except /auth/2fa, send them there
  if (hasPending2fa && !pathname.startsWith("/auth/2fa") && !pathname.startsWith("/auth/logout")) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/2fa"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // Already-signed-in users skip the auth pages
  if (isAuthed && AUTH_PAGES.some((p) => pathname === p)) {
    const url = request.nextUrl.clone()
    url.pathname = "/chat"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth/verify-email).*)"],
}

// Suppress unused import warning for getIronSession (kept for parity / future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = { getIronSession, cookies }
