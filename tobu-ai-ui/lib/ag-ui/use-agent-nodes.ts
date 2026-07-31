"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createTopicAgentClient } from "@/lib/ag-ui/agent-client";
import {
    AGENT_NODES,
    candidateLabels,
    getNodeIndex,
    initialStepStatus,
    type AgentNodeId,
    type InterruptPayload,
    type StepStatus,
    type TopicCandidate,
} from "@/lib/ag-ui/agent-nodes";

export type AgentNodeSyncState = {
    statuses: Record<AgentNodeId, StepStatus>;
    /** Highest node index that should be visible in the ChainOfThought. */
    activeIndex: number;
    subjects: string[];
    extractedTopics: TopicCandidate[];
    expandedTopics: TopicCandidate[];
    selectedSubject: string | null;
    selectedTopics: string[];
    interrupt: InterruptPayload | null;
    isRunning: boolean;
    error: string | null;
    resumeSelection: (value: string | string[]) => Promise<void>;
};

type NodeEventValue = {
    type?: string;
    node?: string;
    status?: string;
    subjects?: unknown;
    topics?: unknown;
    selected_subject?: unknown;
    selected_topics?: unknown;
};

function asTopicCandidates(raw: unknown): TopicCandidate[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item, index) => {
        if (typeof item === "string") {
            return { id: item, name: item };
        }
        if (item && typeof item === "object") {
            const obj = item as { id?: unknown; name?: unknown };
            const name = obj.name != null ? String(obj.name) : `Topic ${index + 1}`;
            const id = obj.id != null ? String(obj.id) : name;
            return { id, name };
        }
        return { id: String(index), name: String(item) };
    });
}

function applyStarted(
    prev: Record<AgentNodeId, StepStatus>,
    nodeId: AgentNodeId,
): Record<AgentNodeId, StepStatus> {
    const idx = getNodeIndex(nodeId);
    const next = { ...prev };
    for (const def of AGENT_NODES) {
        const i = getNodeIndex(def.id);
        if (i < idx) next[def.id] = "complete";
        else if (i === idx) next[def.id] = "active";
        // leave later nodes as-is (usually pending)
    }
    return next;
}

function applyFinished(
    prev: Record<AgentNodeId, StepStatus>,
    nodeId: AgentNodeId,
): Record<AgentNodeId, StepStatus> {
    return { ...prev, [nodeId]: "complete" };
}

/**
 * Subscribe to the topic LangGraph agent and sync NODE_EVENT / on_interrupt
 * into ChainOfThought step state. Selection resumes via forwardedProps.command.resume.
 *
 * Pass `enabled: false` to skip subscribe/run (e.g. while still on upload/preview).
 */
export function useAgentNodes(
    chatId: string | undefined,
    options?: { enabled?: boolean },
): AgentNodeSyncState {
    const enabled = options?.enabled ?? true;
    const agentRef = useRef(createTopicAgentClient());
    const [statuses, setStatuses] = useState(initialStepStatus);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [extractedTopics, setExtractedTopics] = useState<TopicCandidate[]>([]);
    const [expandedTopics, setExpandedTopics] = useState<TopicCandidate[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
    const [interrupt, setInterrupt] = useState<InterruptPayload | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleNodeEvent = useCallback((value: unknown) => {
        if (!value || typeof value !== "object") return;
        const ev = value as NodeEventValue;
        if (!ev.node || getNodeIndex(ev.node) < 0) return;
        const nodeId = ev.node as AgentNodeId;
        const idx = getNodeIndex(nodeId);

        if (ev.status === "started") {
            setActiveIndex((prev) => Math.max(prev, idx));
            setStatuses((prev) => applyStarted(prev, nodeId));
            setError(null);
            return;
        }

        if (ev.status === "finished") {
            setActiveIndex((prev) => Math.max(prev, idx));
            setStatuses((prev) => applyFinished(prev, nodeId));

            if (Array.isArray(ev.subjects)) {
                setSubjects(candidateLabels(ev.subjects));
            }
            if (ev.topics !== undefined) {
                const parsed = asTopicCandidates(ev.topics);
                if (nodeId === "topic_expansion") {
                    setExpandedTopics(parsed);
                } else {
                    setExtractedTopics(parsed);
                }
            }
            if (typeof ev.selected_subject === "string") {
                setSelectedSubject(ev.selected_subject);
                setInterrupt(null);
            }
            if (Array.isArray(ev.selected_topics)) {
                setSelectedTopics(candidateLabels(ev.selected_topics));
                setInterrupt(null);
            }
        }
    }, []);

    const handleInterrupt = useCallback((value: unknown) => {
        let payload: InterruptPayload | null = null;
        if (typeof value === "string") {
            try {
                payload = JSON.parse(value) as InterruptPayload;
            } catch {
                payload = { message: value };
            }
        } else if (value && typeof value === "object") {
            payload = value as InterruptPayload;
        }
        if (!payload) return;

        setInterrupt(payload);

        const type = payload.type;
        if (type === "subject_selection") {
            setActiveIndex((prev) =>
                Math.max(prev, getNodeIndex("subject_selection")),
            );
            setStatuses((prev) => applyStarted(prev, "subject_selection"));
            if (payload.candidates) {
                setSubjects(candidateLabels(payload.candidates));
            }
        } else if (type === "topic_selection") {
            setActiveIndex((prev) =>
                Math.max(prev, getNodeIndex("topic_selection")),
            );
            setStatuses((prev) => applyStarted(prev, "topic_selection"));
            if (payload.candidates) {
                setExtractedTopics(asTopicCandidates(payload.candidates));
            }
        }
    }, []);

    const resumeSelection = useCallback(
        async (value: string | string[]) => {
            if (!chatId) return;
            const agent = agentRef.current;
            agent.threadId = chatId;
            setIsRunning(true);
            setError(null);
            try {
                // ag_ui_langgraph resumes via forwardedProps.command.resume
                await agent.runAgent({
                    forwardedProps: {
                        command: { resume: value },
                    },
                });
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to resume agent",
                );
            } finally {
                setIsRunning(false);
            }
        },
        [chatId],
    );

    useEffect(() => {
        if (!chatId || !enabled) return;

        const agent = agentRef.current;
        agent.threadId = chatId;

        const unsubscribe = agent.subscribe({
            onRunInitialized: () => {
                setIsRunning(true);
                setError(null);
            },
            onRunFinishedEvent: () => {
                setIsRunning(false);
            },
            onRunFailed: ({ error: err }) => {
                setIsRunning(false);
                setError(err.message);
            },
            onCustomEvent({ event: { name, value } }) {
                if (name === "NODE_EVENT") {
                    handleNodeEvent(value);
                    return;
                }
                if (name === "on_interrupt") {
                    handleInterrupt(value);
                }
            },
        });

        void agent
            .runAgent({})
            .catch((err: unknown) => {
                setIsRunning(false);
                setError(
                    err instanceof Error ? err.message : "Failed to start agent",
                );
            });

        return () => {
            unsubscribe.unsubscribe();
            agent.abortRun();
        };
    }, [chatId, enabled, handleInterrupt, handleNodeEvent]);

    return {
        statuses,
        activeIndex,
        subjects,
        extractedTopics,
        expandedTopics,
        selectedSubject,
        selectedTopics,
        interrupt,
        isRunning,
        error,
        resumeSelection,
    };
}
