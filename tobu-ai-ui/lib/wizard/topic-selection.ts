import type { LucideIcon } from "lucide-react"
import {
  SearchIcon,
  Library,
  Book,
  BookOpenText,
  ListTree,
  VectorSquare,
} from "lucide-react"

/** Wizard ChainOfThought step ids (labels match the former agent nodes). */
export type AgentNodeId =
  | "subject_extraction"
  | "subject_selection"
  | "topic_extraction"
  | "topic_selection"
  | "topic_expansion"
  | "build_topic_graph"

export type StepStatus = "pending" | "active" | "complete"

export type AgentNodeKind = "extract" | "select" | "work"

export type AgentNodeDef = {
  id: AgentNodeId
  label: string
  icon: LucideIcon
  kind: AgentNodeKind
}

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
] as const

export function getNodeIndex(id: string): number {
  return AGENT_NODES.findIndex((n) => n.id === id)
}

export function initialStepStatus(): Record<AgentNodeId, StepStatus> {
  return {
    subject_extraction: "pending",
    subject_selection: "pending",
    topic_extraction: "pending",
    topic_selection: "pending",
    topic_expansion: "pending",
    build_topic_graph: "pending",
  }
}

export type TopicCandidate = {
  id: string
  name: string
}

export type InterruptPayload = {
  type?: string
  candidates?: unknown
  message?: string
}

export type TopicGraphSubject = {
  id?: string
  name?: string
  subtopics?: Array<{
    id?: string
    name?: string
    granular?: Array<{ id?: string; name?: string }>
  }>
}

export function subjectLabels(subjects: TopicGraphSubject[]): string[] {
  return subjects.map((s, i) => {
    const name = s.name?.trim()
    if (name) return name
    if (s.id?.trim()) return s.id.trim()
    return `Subject ${i + 1}`
  })
}

export function topicsForSubject(
  subjects: TopicGraphSubject[],
  selectedSubject: string,
): TopicCandidate[] {
  const subject = subjects.find((s) => {
    const label = s.name?.trim() || s.id?.trim() || ""
    return label === selectedSubject || s.id === selectedSubject
  })
  if (!subject) return []

  const out: TopicCandidate[] = []
  for (const sub of subject.subtopics ?? []) {
    const name = sub.name?.trim() || sub.id?.trim()
    if (!name) continue
    out.push({ id: sub.id?.trim() || name, name })
  }
  return out
}

export function expandTopicsForSelection(
  subjects: TopicGraphSubject[],
  selectedSubject: string,
  selectedTopicNames: string[],
): TopicCandidate[] {
  const subject = subjects.find((s) => {
    const label = s.name?.trim() || s.id?.trim() || ""
    return label === selectedSubject || s.id === selectedSubject
  })
  if (!subject) return []

  const wanted = new Set(selectedTopicNames)
  const out: TopicCandidate[] = []
  for (const sub of subject.subtopics ?? []) {
    const subName = sub.name?.trim() || sub.id?.trim() || ""
    if (!wanted.has(subName) && !wanted.has(sub.id ?? "")) continue
    const granular = sub.granular ?? []
    if (granular.length === 0) {
      if (subName) out.push({ id: sub.id?.trim() || subName, name: subName })
      continue
    }
    for (const g of granular) {
      const name = g.name?.trim() || g.id?.trim()
      if (!name) continue
      out.push({ id: g.id?.trim() || name, name })
    }
  }
  return out
}
