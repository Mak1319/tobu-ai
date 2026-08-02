import VoiceRoom from "@/components/voice-room";

interface VoicePageProps {
    params: Promise<{ chatId: string }>;
}

/**
 * /chat/[chatId]/live
 *
 * Full LiveKit Agents session UI. Room name is `chat-{chatId}`; the same
 * chatId keys Redis `quiz_agent_bus` events shown in the status strip.
 */
export default async function VoicePage({ params }: VoicePageProps) {
    const { chatId } = await params;
    const serverUrl =
        process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? "";

    if (!serverUrl) {
        return (
            <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-destructive max-w-md text-sm">
                    LiveKit is not configured. Set{" "}
                    <code className="font-mono">NEXT_PUBLIC_LIVEKIT_URL</code>{" "}
                    (and server{" "}
                    <code className="font-mono">LIVEKIT_*</code> keys) to enable
                    voice sessions.
                </p>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-1 flex-col">
            <VoiceRoom chatId={chatId} />
        </div>
    );
}
