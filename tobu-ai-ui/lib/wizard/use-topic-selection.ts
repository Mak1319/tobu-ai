"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AGENT_NODES,
  expandTopicsForSelection,
  getNodeIndex,
  initialStepStatus,
  subjectLabels,
  topicsForSubject,
  type AgentNodeId,
  type InterruptPayload,
  type StepStatus,
  type TopicCandidate,
  type TopicGraphSubject,
} from "@/lib/wizard/topic-selection"
import {
  readWizardHash,
  writeWizardHash,
  writeWizardSelection,
} from "@/lib/wizard/storage"

export type TopicSelectionState = {
  statuses: Record<AgentNodeId, StepStatus>
  activeIndex: number
  subjects: string[]
  extractedTopics: TopicCandidate[]
  expandedTopics: TopicCandidate[]
  selectedSubject: string | null
  selectedTopics: string[]
  interrupt: InterruptPayload | null
  isRunning: boolean
  error: string | null
  /** True after Next saved prefs to DB. */
  selectionPersisted: boolean
  /** Subject/topic picks are ready for the Next button. */
  canConfirm: boolean
  resumeSelection: (value: string | string[]) => Promise<void>
  /** Persist study prefs and mark ready for LiveKit. */
  confirmAndStartLive: () => Promise<boolean>
}

type HashContentResponse =
  | {
      ok: true
      hashId: string
      content: { topicGraph: { subjects?: TopicGraphSubject[] } }
    }
  | { ok: false; error: string }

function statusesWithActive(activeId: AgentNodeId): Record<AgentNodeId, StepStatus> {
  const next = initialStepStatus()
  const activeIdx = getNodeIndex(activeId)
  for (const def of AGENT_NODES) {
    const i = getNodeIndex(def.id)
    if (i < activeIdx) next[def.id] = "complete"
    else if (i === activeIdx) next[def.id] = "active"
    else next[def.id] = "pending"
  }
  return next
}

function allComplete(): Record<AgentNodeId, StepStatus> {
  const next = initialStepStatus()
  for (const def of AGENT_NODES) next[def.id] = "complete"
  return next
}

async function resolveFileHash(chatId: string): Promise<string | null> {
  const stored = readWizardHash(chatId)
  if (stored?.fileHash) return stored.fileHash

  const res = await fetch(`/api/uploads/${encodeURIComponent(chatId)}/hash`)
  const data = (await res.json().catch(() => null)) as
    | { ok: true; contentHash: string; mdKey?: string | null }
    | { ok: false }
    | null
  if (!res.ok || !data || !data.ok) return null

  writeWizardHash(chatId, {
    fileHash: data.contentHash,
    ...(data.mdKey ? { mdKey: data.mdKey } : {}),
  })
  return data.contentHash
}

/**
 * Load topicGraph from hashContentMap and drive the same ChainOfThought
 * selection UX formerly backed by AG-UI / LangGraph interrupts.
 */
export function useTopicSelectionFromHash(
  chatId: string | undefined,
  options?: { enabled?: boolean },
): TopicSelectionState {
  const enabled = options?.enabled ?? true
  const subjectsRef = useRef<TopicGraphSubject[]>([])
  const fileHashRef = useRef<string | null>(null)

  const [statuses, setStatuses] = useState(initialStepStatus)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [subjects, setSubjects] = useState<string[]>([])
  const [extractedTopics, setExtractedTopics] = useState<TopicCandidate[]>([])
  const [expandedTopics, setExpandedTopics] = useState<TopicCandidate[]>([])
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [interrupt, setInterrupt] = useState<InterruptPayload | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectionPersisted, setSelectionPersisted] = useState(false)

  useEffect(() => {
    if (!chatId || !enabled) return

    let cancelled = false

    const run = async () => {
      setIsRunning(true)
      setError(null)
      setSelectedSubject(null)
      setSelectedTopics([])
      setExtractedTopics([])
      setExpandedTopics([])
      setInterrupt(null)
      setSelectionPersisted(false)
      setActiveIndex(getNodeIndex("subject_extraction"))
      setStatuses(statusesWithActive("subject_extraction"))

      try {
        const fileHash = await resolveFileHash(chatId)
        if (cancelled) return
        if (!fileHash) {
          setError(
            "Missing file hash. Finish document preview first, or re-upload.",
          )
          setIsRunning(false)
          return
        }
        fileHashRef.current = fileHash

        const res = await fetch(
          `/api/hash-content/${encodeURIComponent(fileHash)}`,
        )
        const data = (await res.json().catch(() => null)) as
          | HashContentResponse
          | null
        if (cancelled) return

        if (!res.ok || !data || !data.ok) {
          setError(
            data && !data.ok
              ? data.error
              : `Failed to load topic graph (${res.status})`,
          )
          setIsRunning(false)
          return
        }

        const graphSubjects = data.content.topicGraph.subjects ?? []
        subjectsRef.current = graphSubjects
        const labels = subjectLabels(graphSubjects)
        if (labels.length === 0) {
          setError("Topic graph has no subjects for this document.")
          setIsRunning(false)
          return
        }

        setSubjects(labels)
        setActiveIndex(getNodeIndex("subject_selection"))
        setStatuses(statusesWithActive("subject_selection"))
        setInterrupt({ type: "subject_selection", candidates: labels })
        setIsRunning(false)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "Failed to load topic graph",
        )
        setIsRunning(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [chatId, enabled])

  const resumeSelection = useCallback(
    async (value: string | string[]) => {
      if (!chatId) return

      const asList = Array.isArray(value) ? value : [value]
      const first = asList[0]?.trim()
      if (!first) return

      if (interrupt?.type === "subject_selection") {
        const subject = first
        setSelectedSubject(subject)
        setSelectedTopics([])
        setInterrupt(null)

        const topics = topicsForSubject(subjectsRef.current, subject)
        setExtractedTopics(topics)
        setActiveIndex(getNodeIndex("topic_extraction"))
        setStatuses(statusesWithActive("topic_extraction"))

        await new Promise((r) => setTimeout(r, 200))

        setActiveIndex(getNodeIndex("topic_selection"))
        setStatuses(statusesWithActive("topic_selection"))
        setInterrupt({
          type: "topic_selection",
          candidates: topics.map((t) => t.name),
        })
        return
      }

      // Toggle topics — user clicks Next when done selecting.
      if (interrupt?.type === "topic_selection" && selectedSubject) {
        const name = first
        setSelectedTopics((prev) =>
          prev.includes(name)
            ? prev.filter((t) => t !== name)
            : [...prev, name],
        )
      }
    },
    [chatId, interrupt?.type, selectedSubject],
  )

  const confirmAndStartLive = useCallback(async (): Promise<boolean> => {
    if (!chatId || !selectedSubject || selectedTopics.length === 0) {
      setError("Select a subject and at least one topic first.")
      return false
    }

    setError(null)
    setIsRunning(true)
    setInterrupt(null)

    const expanded = expandTopicsForSelection(
      subjectsRef.current,
      selectedSubject,
      selectedTopics,
    )
    setExpandedTopics(
      expanded.length > 0
        ? expanded
        : selectedTopics.map((n) => ({ id: n, name: n })),
    )

    setActiveIndex(getNodeIndex("topic_expansion"))
    setStatuses(statusesWithActive("topic_expansion"))
    await new Promise((r) => setTimeout(r, 150))

    setActiveIndex(getNodeIndex("build_topic_graph"))
    setStatuses(statusesWithActive("build_topic_graph"))
    await new Promise((r) => setTimeout(r, 150))

    setStatuses(allComplete())
    setActiveIndex(getNodeIndex("build_topic_graph"))

    const fileHash = fileHashRef.current ?? readWizardHash(chatId)?.fileHash
    writeWizardSelection(chatId, {
      fileHash,
      selectedSubject,
      selectedTopics,
    })

    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(chatId)}/study`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "topics_selected",
            fileHash,
            mdKey: fileHash ? `${fileHash}.md` : undefined,
            selectedSubject,
            selectedTopics,
          }),
        },
      )
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null
      if (!res.ok || !data || !data.ok) {
        setError(
          data && !data.ok && data.error
            ? data.error
            : "Failed to save study preferences",
        )
        setIsRunning(false)
        return false
      }

      await fetch(`/api/chat/${encodeURIComponent(chatId)}/study`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      }).catch(() => undefined)

      setSelectionPersisted(true)
      setIsRunning(false)
      return true
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save study preferences",
      )
      setIsRunning(false)
      return false
    }
  }, [chatId, selectedSubject, selectedTopics])

  const canConfirm = Boolean(
    selectedSubject && selectedTopics.length > 0 && !selectionPersisted,
  )

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
    selectionPersisted,
    canConfirm,
    resumeSelection,
    confirmAndStartLive,
  }
}
