// // import VoiceRoom from "@/components/voice-room";

// interface VoicePageProps {
//     params: Promise<{ chatId: string }>;
// }

// /**
//  * /chat/[chatId]/live
//  *
//  * Renders the LiveKit audio-only room for the chat. The room connects
//  * to `chat-{chatId}` and identifies the participant as the signed-in
//  * user, which the livekit-agent worker uses to find (or create) the
//  * matching LangGraph thread.
//  */
// export default async function VoicePage({ params }: VoicePageProps) {
//     const { chatId } = await params;
//     const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

//     if (!serverUrl) {
//         return (
//             <div className="flex flex-1 items-center justify-center">
//                 <p className="text-sm text-destructive">
//                     NEXT_PUBLIC_LIVEKIT_URL is not configured. Voice sessions
//                     are unavailable until it is set.
//                 </p>
//             </div>
//         );
//     }

//     return (
//         <div className="flex flex-1 items-center justify-center">
//             {/*<VoiceRoom chatId={chatId} serverUrl={serverUrl} />*/}
//         </div>
//     );
// }
"use client";

import { useSession, useAgent } from "@livekit/components-react";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { AgentAudioVisualizerWave } from "@/components/agents-ui/agent-audio-visualizer-wave";

// const TOKEN_SOURCE = TokenSource.endpoint("/api/token");

export function Demo() {
    // const { audioTrack, state } = useAgent();

    return (
        <AgentAudioVisualizerWave
            size="xl"
            color="#1FD5F9"
            blur={0.1}
            lineWidth={2}
            audioTrack={audioTrack}
            state={state}
            colorShift={0.3}
        />
    );
}

export default function DemoWrapper({ session }) {
    const session = useSession(TOKEN_SOURCE);

    return (
        <AgentSessionProvider session={session}>
            <Demo />
        </AgentSessionProvider>
    );
}
