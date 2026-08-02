"use client";

import {
  RoomAudioRenderer,
  type RoomAudioRendererProps,
  SessionProvider,
  type SessionProviderProps,
  type UseSessionReturn,
} from "@livekit/components-react";

export type AgentSessionProviderProps = SessionProviderProps &
  RoomAudioRendererProps & {
    session: UseSessionReturn;
    children: React.ReactNode;
  };

/**
 * Wraps LiveKit SessionProvider and plays remote agent audio.
 */
export function AgentSessionProvider({
  session,
  children,
  ...roomAudioRendererProps
}: AgentSessionProviderProps) {
  return (
    <SessionProvider session={session}>
      {children}
      <RoomAudioRenderer {...roomAudioRendererProps} />
    </SessionProvider>
  );
}
