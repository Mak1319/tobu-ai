"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ListTodo } from "lucide-react";
import { defineStepper } from "@stepperize/react";
import UploadStep from "./steps/upload-document";
import PreviewDocument from "./steps/preview-document";
import AgenticSteps from "./steps/agentic-steps";
import {
    QueueItem,
    QueueItemIndicator,
    QueueItemContent,
    type QueueTodo,
} from "@/components/ai/queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AGENT_NODES,
    type AgentNodeId,
    type StepStatus,
} from "@/lib/ag-ui/agent-nodes";
import { useAgentNodes } from "@/lib/ag-ui/use-agent-nodes";

const wizardSteps = defineStepper([
    { id: "upload" },
    { id: "preview" },
    { id: "agentic" },
]);

const AGENT_QUEUE_TITLES: Record<AgentNodeId, string> = {
    subject_extraction: "Extracting subject",
    subject_selection: "Selecting subject",
    topic_extraction: "Extracting topics",
    topic_selection: "Selecting topics",
    topic_expansion: "Expanding topics",
    build_topic_graph: "Generating topics graph",
};

function toQueueStatus(status: StepStatus): QueueTodo["status"] {
    return status === "complete" ? "completed" : "pending";
}

function deriveTodos(
    currentStepId: "upload" | "preview" | "agentic",
    agentStatuses: Record<AgentNodeId, StepStatus>,
): QueueTodo[] {
    const uploadDone =
        currentStepId === "preview" || currentStepId === "agentic";
    const previewDone = currentStepId === "agentic";

    return [
        {
            id: "upload",
            title: "Uploading syllabus text",
            status: uploadDone ? "completed" : "pending",
        },
        {
            id: "preview",
            title: "Preview Syllabus text",
            status: previewDone ? "completed" : "pending",
        },
        ...AGENT_NODES.map((node) => ({
            id: node.id,
            title: AGENT_QUEUE_TITLES[node.id],
            status: toQueueStatus(agentStatuses[node.id]),
        })),
    ];
}

export default function Wizard() {
    const params = useParams();
    const router = useRouter();
    const chatId = (params.chatId ?? params.id) as string | undefined;
    const stepper = wizardSteps.useStepper();
    const currentStepId = stepper.id;

    const agent = useAgentNodes(chatId, {
        enabled: currentStepId === "agentic",
    });

    const todos = useMemo(
        () => deriveTodos(currentStepId, agent.statuses),
        [currentStepId, agent.statuses],
    );
    const pendingCount = todos.filter((t) => t.status !== "completed").length;
    const completedCount = todos.length - pendingCount;
    const queueComplete =
        currentStepId === "agentic" &&
        pendingCount === 0 &&
        agent.statuses.build_topic_graph === "complete";

    useEffect(() => {
        if (!chatId || !queueComplete) return;
        router.replace(`/chat/${encodeURIComponent(chatId)}/live`);
    }, [chatId, queueComplete, router]);

    return (
        <div className="relative h-full w-full">
            <div className="h-full w-full overflow-auto p-4 sm:p-6">
                {stepper.match({
                    upload: () => <UploadStep next={stepper.next} />,
                    preview: () => <PreviewDocument next={stepper.next} />,
                    agentic: () => <AgenticSteps agent={agent} />,
                })}
            </div>

            <Dialog>
                <DialogTrigger
                    render={
                        <Button
                            type="button"
                            size="lg"
                            className="fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg sm:right-6 sm:bottom-6"
                            aria-label={`Open progress queue, ${pendingCount} remaining`}
                        />
                    }
                >
                    <ListTodo className="size-4" />
                    <span className="text-sm font-medium">Queue</span>
                    {queueComplete ? (
                        <Badge
                            variant="secondary"
                            className="h-5 rounded-full px-1.5 text-[11px]"
                        >
                            Done
                        </Badge>
                    ) : (
                        <Badge
                            variant="secondary"
                            className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]"
                        >
                            {pendingCount}
                        </Badge>
                    )}
                </DialogTrigger>

                <DialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-sm">
                    <DialogHeader className="border-b border-border px-4 py-3 pr-12 text-left">
                        <DialogTitle className="text-sm">Progress</DialogTitle>
                        <DialogDescription className="text-xs">
                            {queueComplete
                                ? "All steps complete — opening live session…"
                                : `${completedCount}/${todos.length} complete${
                                      pendingCount > 0
                                          ? ` · ${pendingCount} remaining`
                                          : ""
                                  }`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[min(60vh,22rem)] overflow-y-auto px-2 py-2">
                        <ul className="flex flex-col gap-0.5">
                            {todos.map((todo) => {
                                const completed = todo.status === "completed";
                                return (
                                    <QueueItem
                                        key={todo.id}
                                        className="rounded-md px-2 py-1.5"
                                    >
                                        <div className="flex items-center gap-2">
                                            <QueueItemIndicator
                                                completed={completed}
                                                className="mt-0 size-2"
                                            />
                                            <QueueItemContent
                                                completed={completed}
                                                className="text-xs"
                                            >
                                                {todo.title}
                                            </QueueItemContent>
                                        </div>
                                    </QueueItem>
                                );
                            })}
                        </ul>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
