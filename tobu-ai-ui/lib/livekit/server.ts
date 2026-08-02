import "server-only"

/**
 * Centralized access to the LiveKit credentials the token route needs.
 *
 * `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are server-only -- never
 * exposed to the browser. `NEXT_PUBLIC_LIVEKIT_URL` is the WebSocket URL
 * the client uses to dial the room.
 */

function readRequired(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Add it to .env.local. See .env.example for the keys.`,
    )
  }
  return value
}

export interface LiveKitEnv {
  url: string
  apiKey: string
  apiSecret: string
}

export function getLiveKitEnv(): LiveKitEnv {
  // Browser / TokenSource must dial the host-published Docker LiveKit
  // (ws://localhost:7880), not the compose-internal hostname (ws://livekit:7880).
  const publicUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim()
  return {
    url: publicUrl && publicUrl.length > 0 ? publicUrl : readRequired("LIVEKIT_URL"),
    apiKey: readRequired("LIVEKIT_API_KEY"),
    apiSecret: readRequired("LIVEKIT_API_SECRET"),
  }
}
