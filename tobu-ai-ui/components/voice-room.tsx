"use client"

import "@livekit/components-styles"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { TokenSource } from "livekit-client"
import { useSession, useSessionContext } from "@livekit/components-react"
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider"
import { StartAudioButton } from "@/components/agents-ui/start-audio-button"
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { readWizardSelection } from "@/lib/wizard/storage"

interface VoiceRoomProps {
    chatId: string
}

type QuizBusEvent = {
    chatId: string
    from: string
    to: string
    type: string
    payload?: Record<string, unknown>
}

function QuizStatusStrip({ chatId }: { chatId: string }) {
    const [last, setLast] = useState<QuizBusEvent | null>(null)
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        const es = new EventSource(`/api/quiz-events/${encodeURIComponent(chatId)}`)
        es.addEventListener("connected", () => setConnected(true))
        es.addEventListener("quiz", (ev) => {
            try {
                const data = JSON.parse((ev as MessageEvent).data) as QuizBusEvent
                setLast(data)
            } catch {
                // ignore malformed
            }
        })
        es.onerror = () => setConnected(false)
        return () => es.close()
    }, [chatId])

    const label = (() => {
        if (!last) {
            return connected
                ? "Quiz bus connected — waiting for agent events"
                : "Connecting quiz bus…"
        }
        const spoken =
            typeof last.payload?.spoken_prompt === "string"
                ? last.payload.spoken_prompt
                : null
        const question =
            typeof last.payload?.question === "string" ? last.payload.question : null
        if (spoken) return spoken
        if (question) return question
        return `${last.from} → ${last.type}`
    })()

    return (
        <div className="border-border/60 bg-muted/40 absolute inset-x-0 top-0 z-40 border-b px-4 py-2 text-center text-xs sm:text-sm">
            <span className="text-muted-foreground">{label}</span>
        </div>
    )
}

function WelcomePanel({
    chatId,
    onStart,
    starting,
    error,
}: {
    chatId: string
    onStart: () => void
    starting: boolean
    error: string | null
}) {
    const router = useRouter()

    return (
        <Card className="mx-auto w-full max-w-lg">
            <CardHeader>
                <CardTitle>Voice study session</CardTitle>
                <CardDescription>
                    Join the LiveKit room for chat{" "}
                    <span className="font-mono text-foreground">{chatId}</span>. The
                    voice agent will greet you and run the quiz over the shared Redis
                    bus.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                    variant="outline"
                    onClick={() => router.push(`/chat/${encodeURIComponent(chatId)}`)}
                >
                    Back
                </Button>
                <Button onClick={onStart} disabled={starting}>
                    {starting ? "Connecting…" : "Start call"}
                </Button>
            </CardContent>
            {error ? (
                <p className="text-destructive px-6 pb-4 text-sm">{error}</p>
            ) : null}
        </Card>
    )
}

function SessionShell({ chatId }: { chatId: string }) {
    const router = useRouter()
    const { isConnected, start, end } = useSessionContext()
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleStart = useCallback(async () => {
        setStarting(true)
        setError(null)
        try {
            await start({
                tracks: {
                    microphone: { enabled: true },
                    camera: { enabled: false },
                    screenShare: { enabled: false },
                },
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start session")
        } finally {
            setStarting(false)
        }
    }, [start])

    const handleEnd = useCallback(async () => {
        try {
            await end()
        } finally {
            router.push(`/chat/${encodeURIComponent(chatId)}`)
        }
    }, [end, router, chatId])

    if (!isConnected) {
        return (
            <div className="flex min-h-[min(70vh,640px)] w-full items-center justify-center">
                <WelcomePanel
                    chatId={chatId}
                    onStart={() => void handleStart()}
                    starting={starting}
                    error={error}
                />
            </div>
        )
    }

    return (
        <div className="relative min-h-[min(80vh,720px)] w-full overflow-hidden rounded-xl border">
            <QuizStatusStrip chatId={chatId} />
            <AgentSessionView_01
                className="bg-background absolute inset-0 pt-10"
                supportsChatInput
                supportsVideoInput={false}
                supportsScreenShare={false}
                preConnectMessage="Agent is joining — say hello when you're ready"
                audioVisualizerType="wave"
                audioVisualizerColor="#1FD5F9"
                audioVisualizerColorShift={0.3}
                audioVisualizerWaveLineWidth={2}
                isPreConnectBufferEnabled
            />
            {/* End-call is also on the control bar; keep an escape if agent view stalls */}
            <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 z-50"
                onClick={() => void handleEnd()}
            >
                Leave
            </Button>
            <StartAudioButton
                label="Enable audio"
                className="absolute top-2 left-2 z-50"
            />
        </div>
    )
}

/**
 * LiveKit Agents session for `/chat/[chatId]/live`.
 *
 * Token is fetched from `/api/livekit/token` with the wizard chatId so the
 * room is always `chat-{chatId}` and matches the Redis quiz bus key.
 * Wizard subject/topic selection (sessionStorage) is forwarded as agent metadata.
 */
export default function VoiceRoom({ chatId }: VoiceRoomProps) {
    const tokenSource = useMemo(
        () =>
            TokenSource.custom(async () => {
                const selection = readWizardSelection(chatId)
                const response = await fetch("/api/livekit/token", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        chatId,
                        ...(selection?.fileHash
                            ? { fileHash: selection.fileHash }
                            : {}),
                        ...(selection?.selectedSubject
                            ? { selectedSubject: selection.selectedSubject }
                            : {}),
                        ...(selection?.selectedTopics?.length
                            ? { selectedTopics: selection.selectedTopics }
                            : {}),
                    }),
                })
                const data = (await response.json().catch(() => null)) as
                    | {
                          ok: true
                          serverUrl: string
                          participantToken?: string
                          token?: string
                      }
                    | { ok: false; error: string }
                    | null

                if (!response.ok || !data || !data.ok) {
                    const message =
                        data && !data.ok
                            ? data.error
                            : `token request failed (${response.status})`
                    throw new Error(message)
                }

                const participantToken = data.participantToken ?? data.token
                if (!participantToken) {
                    throw new Error("token response missing participantToken")
                }

                return {
                    serverUrl: data.serverUrl,
                    participantToken,
                }
            }),
        [chatId],
    )

    const session = useSession(tokenSource)

    return (
        <AgentSessionProvider session={session}>
            <SessionShell chatId={chatId} />
        </AgentSessionProvider>
    )
}
