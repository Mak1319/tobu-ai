import { NextResponse } from "next/server"
import { AccessToken } from "livekit-server-sdk"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { getLiveKitEnv } from "@/lib/livekit/server"

export const runtime = "nodejs"

/**
 * POST /api/livekit/token
 *
 * Issues a LiveKit access token for `room=chat-{chatId}` and the
 * signed-in user's iron-session userId. The browser passes this token
 * to LiveKitRoom, which then connects over WebRTC.
 *
 * Auth: requires an authenticated session (iron-session). The room
 * grant is intentionally tight -- one chat per room, one user per
 * identity. Re-joining the same chat from the same user reuses the
 * LangGraph thread on the agent side.
 */

const Body = z.object({
    chatId: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9_-]+$/, "chatId must be a safe slug"),
})

function badRequest(error: string) {
    return NextResponse.json({ ok: false, error }, { status: 400 })
}

function unauthorized() {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
}

function serviceUnavailable(error: string) {
    return NextResponse.json({ ok: false, error }, { status: 503 })
}

export async function POST(request: Request) {
    const session = await getSession()
    if (!session.userId) {
        return unauthorized()
    }

    let payload: unknown
    try {
        payload = await request.json()
    } catch {
        return badRequest("Invalid JSON body")
    }
    const parsed = Body.safeParse(payload)
    if (!parsed.success) {
        return badRequest(
            parsed.error.issues.map((i) => i.message).join("; "),
        )
    }
    const { chatId } = parsed.data

    let env
    try {
        env = getLiveKitEnv()
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "LiveKit env missing"
        return serviceUnavailable(message)
    }

    const roomName = `chat-${chatId}`
    const at = new AccessToken(env.apiKey, env.apiSecret, {
        identity: session.userId,
        name: session.email ?? session.userId,
        ttl: 60 * 10, // 10 minutes -- enough to survive a refresh
    })
    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    })

    const token = await at.toJwt()
    return NextResponse.json({
        ok: true,
        serverUrl: env.url,
        token,
        room: roomName,
        identity: session.userId,
    })
}
