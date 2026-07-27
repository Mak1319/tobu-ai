"use client";

import { useRouter } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
    const router = useRouter();

    const handleNewChat = () => {
        const chatId = crypto.randomUUID();
        router.push(`/chat/${chatId}`);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
            <EmptyState onNewChat={handleNewChat} />
        </div>
    );
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
    return (
        <>
            <div className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-muted p-4">
                    <HugeiconsIcon
                        icon={Add01Icon}
                        className="size-8 text-muted-foreground"
                    />
                </div>
                <h2 className="text-lg font-semibold">
                    You have to start a chat
                </h2>
                <p className="text-muted-foreground max-w-xs">
                    Start a new conversation to get started with Tobu AI
                </p>
            </div>
            <Button onClick={onNewChat}>
                <HugeiconsIcon icon={Add01Icon} className="size-4 mr-2" />
                New Chat
            </Button>
        </>
    );
}
