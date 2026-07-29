"use client"

import "@livekit/components-styles"

import {
    RoomAudioRenderer,
} from "@livekit/components-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { LiveKitRoom } from "@livekit/components-react"

interface VoiceRoomProps {
    chatId: string
    serverUrl: string
}

/**
 * Minimal LiveKit audio room used by /chat/[chatId]/live.
 *
 * - Audio-only: no camera.
 * - We hand the room an async token source that fetches
 *   /api/livekit/token on demand. The server route requires an
 *   authenticated session, so missing/expired tokens surface as a
 *   connect error here.
 * - Disconnect returns the user to /chat/[chatId] (the wizard step 3).
 */
export default function VoiceRoom({ chatId, serverUrl }: VoiceRoomProps) {
    const router = useRouter()
    const [token, setToken] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fetchToken = useCallback(async (): Promise<string> => {
        const response = await fetch("/api/livekit/token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chatId }),
        })
        const data = (await response.json().catch(() => null)) as
            | { ok: true; token: string; serverUrl: string; room: string }
            | { ok: false; error: string }
            | null
        if (!response.ok || !data || !data.ok) {
            const message =
                data && !data.ok ? data.error : `token request failed (${response.status})`
            throw new Error(message)
        }
        return data.token
    }, [chatId])

    useEffect(() => {
        // Resolve a token eagerly so the user sees "Connecting..." instead of
        // a blank panel while LiveKitRoom's auto-fetch races.
        let cancelled = false
        fetchToken()
            .then((value) => {
                if (!cancelled) setToken(value)
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to get token")
                }
            })
        return () => {
            cancelled = true
        }
    }, [fetchToken])

    const handleDisconnect = useCallback(() => {
        router.push(`/chat/${chatId}`)
    }, [router, chatId])

    if (error) {
        return (
            <Card className="max-w-lg w-full">
                <CardHeader>
                    <CardTitle>Voice unavailable</CardTitle>
                    <CardDescription>{error}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={() => router.push(`/chat/${chatId}`)}>
                        Back to chat
                    </Button>
                </CardContent>
            </Card>
        )
    }

    if (!token) {
        return (
            <Card className="max-w-lg w-full">
                <CardHeader>
                    <CardTitle>Connecting…</CardTitle>
                    <CardDescription>Joining the voice room.</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <Card className="max-w-lg w-full">
                <CardHeader>
                    <CardTitle>Voice session</CardTitle>
                    <CardDescription>
                        Speak naturally — the agent will ask which subject you want to
                        study, then guide you through a quiz.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <LiveKitRoom
                        serverUrl={serverUrl}
                        token={token}
                        audio
                        video={false}
                        connect
                        onDisconnected={handleDisconnect}
                    >
                        <RoomAudioRenderer />
                        <div className="flex justify-end mt-4">
                            <Button variant="outline" onClick={handleDisconnect}>
                                End call
                            </Button>
                        </div>
                    </LiveKitRoom>
                </CardContent>
            </Card>
        </div>
    )
}
