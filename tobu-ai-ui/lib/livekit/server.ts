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
  return {
    url: readRequired("LIVEKIT_URL"),
    apiKey: readRequired("LIVEKIT_API_KEY"),
    apiSecret: readRequired("LIVEKIT_API_SECRET"),
  }
}
