"use client"

interface Step3PageProps {
    chatId?: string
    onLaunchVoice?: () => void
}

export default function Step3Page({ chatId, onLaunchVoice }: Step3PageProps) {
    return (
        <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">Step 3: Review & Create</h1>
            <p className="text-muted-foreground">Review your configuration and create the chat.</p>

            <div className="space-y-4 mt-4 p-4 border rounded-lg">
                <h2 className="font-medium">Configuration Summary</h2>
                <div className="text-sm text-muted-foreground space-y-1">
                    <p>Chat Name: My Chat</p>
                    <p>Model: GPT-4</p>
                    <p>Temperature: 0.7</p>
                    <p>Max Tokens: 1000</p>
                </div>
            </div>

            {chatId && (
                <div className="mt-2 p-4 border rounded-lg space-y-2">
                    <h2 className="font-medium">Talk to it</h2>
                    <p className="text-sm text-muted-foreground">
                        Start a live voice session with the agent. It will drive the
                        same quiz workflow but speak its questions aloud instead of
                        typing them.
                    </p>
                    <button
                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                        onClick={onLaunchVoice}
                        type="button"
                    >
                        Start voice session
                    </button>
                </div>
            )}
        </div>
    )
}
