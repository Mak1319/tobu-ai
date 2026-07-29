import VoiceRoom from "@/components/voice-room"

interface VoicePageProps {
    params: Promise<{ chatId: string }>
}

/**
 * /chat/[chatId]/live
 *
 * Renders the LiveKit audio-only room for the chat. The room connects
 * to `chat-{chatId}` and identifies the participant as the signed-in
 * user, which the livekit-agent worker uses to find (or create) the
 * matching LangGraph thread.
 */
export default async function VoicePage({ params }: VoicePageProps) {
    const { chatId } = await params
    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? ""

    if (!serverUrl) {
        return (
            <div className="flex items-center justify-center flex-1">
                <p className="text-destructive text-sm">
                    NEXT_PUBLIC_LIVEKIT_URL is not configured. Voice sessions are
                    unavailable until it is set.
                </p>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center flex-1">
            <VoiceRoom chatId={chatId} serverUrl={serverUrl} />
        </div>
    )
}
