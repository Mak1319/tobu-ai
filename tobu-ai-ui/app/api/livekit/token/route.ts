import { NextResponse } from "next/server"
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { getLiveKitEnv } from "@/lib/livekit/server"

export const runtime = "nodejs"

/**
 * POST /api/livekit/token
 *
 * Issues a LiveKit access token for `room=chat-{chatId}` and the
 * signed-in user's iron-session userId. Dispatches the named voice
 * agent (default `quiz`) into that room via roomConfig.
 *
 * Optional wizard selection (subject/topics/fileHash) is placed on both
 * participant metadata and RoomAgentDispatch.metadata.
 */

const Body = z.object({
  chatId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "chatId must be a safe slug"),
  fileHash: z.string().min(8).max(128).optional(),
  selectedSubject: z.string().min(1).max(200).optional(),
  selectedTopics: z.array(z.string().min(1).max(200)).max(50).optional(),
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
    return badRequest(parsed.error.issues.map((i) => i.message).join("; "))
  }
  const { chatId, fileHash, selectedSubject, selectedTopics } = parsed.data

  let env
  try {
    env = getLiveKitEnv()
  } catch (err) {
    const message = err instanceof Error ? err.message : "LiveKit env missing"
    return serviceUnavailable(message)
  }

  const roomName = `chat-${chatId}`
  const agentName = process.env.LIVEKIT_AGENT_NAME?.trim() || "quiz"

  const agentMetadata = JSON.stringify({
    chatId,
    ...(fileHash ? { fileHash } : {}),
    ...(selectedSubject ? { selectedSubject } : {}),
    ...(selectedTopics && selectedTopics.length > 0
      ? { selectedTopics }
      : {}),
  })

  const at = new AccessToken(env.apiKey, env.apiSecret, {
    identity: session.userId,
    name: session.email ?? session.userId,
    ttl: 60 * 10,
    metadata: agentMetadata,
    attributes: { chatId },
  })
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
        metadata: agentMetadata,
      }),
    ],
  })

  const participantToken = await at.toJwt()
  return NextResponse.json({
    ok: true,
    serverUrl: env.url,
    // LiveKit TokenSource expects participantToken; keep token for older clients.
    participantToken,
    token: participantToken,
    roomName,
    room: roomName,
    chatId,
    identity: session.userId,
    agentName,
  })
}
