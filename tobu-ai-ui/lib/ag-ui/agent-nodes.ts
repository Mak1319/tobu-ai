import type { LucideIcon } from "lucide-react";
import {
    SearchIcon,
    Library,
    Book,
    BookOpenText,
    ListTree,
    VectorSquare,
} from "lucide-react";

/** LangGraph node ids from `agents/topic/topic_graph.py`. */
export type AgentNodeId =
    | "subject_extraction"
    | "subject_selection"
    | "topic_extraction"
    | "topic_selection"
    | "topic_expansion"
    | "build_topic_graph";

export type StepStatus = "pending" | "active" | "complete";

export type AgentNodeKind = "extract" | "select" | "work";

export type AgentNodeDef = {
    id: AgentNodeId;
    label: string;
    icon: LucideIcon;
    kind: AgentNodeKind;
};

export const AGENT_NODES: readonly AgentNodeDef[] = [
    {
        id: "subject_extraction",
        label: "Extracting relevant subjects from the syllabus",
        icon: SearchIcon,
        kind: "extract",
    },
    {
        id: "subject_selection",
        label: "Select a subject",
        icon: Library,
        kind: "select",
    },
    {
        id: "topic_extraction",
        label: "Extracting relevant topics",
        icon: Book,
        kind: "extract",
    },
    {
        id: "topic_selection",
        label: "Select topics",
        icon: BookOpenText,
        kind: "select",
    },
    {
        id: "topic_expansion",
        label: "Expand topics",
        icon: ListTree,
        kind: "work",
    },
    {
        id: "build_topic_graph",
        label: "Generate topic graph",
        icon: VectorSquare,
        kind: "work",
    },
] as const;

export const AGENT_NODE_IDS = AGENT_NODES.map((n) => n.id);

export function getNodeIndex(id: string): number {
    return AGENT_NODES.findIndex((n) => n.id === id);
}

export function initialStepStatus(): Record<AgentNodeId, StepStatus> {
    return {
        subject_extraction: "pending",
        subject_selection: "pending",
        topic_extraction: "pending",
        topic_selection: "pending",
        topic_expansion: "pending",
        build_topic_graph: "pending",
    };
}

export type TopicCandidate = {
    id: string;
    name: string;
};

export type InterruptPayload = {
    type?: string;
    candidates?: unknown;
    message?: string;
};

export function candidateLabels(candidates: unknown): string[] {
    if (!Array.isArray(candidates)) return [];
    return candidates.map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "name" in c) {
            return String((c as { name: unknown }).name);
        }
        return String(c);
    });
}
