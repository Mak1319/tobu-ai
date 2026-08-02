"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { ListTodo } from "lucide-react"
import { defineStepper } from "@stepperize/react"
import UploadStep from "./steps/upload-document"
import PreviewDocument from "./steps/preview-document"
import AgenticSteps from "./steps/agentic-steps"
import {
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  type QueueTodo,
} from "@/components/ai/queue"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AGENT_NODES,
  type AgentNodeId,
  type StepStatus,
} from "@/lib/wizard/topic-selection"
import { useTopicSelectionFromHash } from "@/lib/wizard/use-topic-selection"
import {
  isWizardStepId,
  patchWizardStep,
  resolveWizardStep,
  type WizardStepId,
} from "@/lib/wizard/steps"

const wizardSteps = defineStepper(
  [{ id: "upload" }, { id: "preview" }, { id: "agentic" }],
  { linear: true },
)

const AGENT_QUEUE_TITLES: Record<AgentNodeId, string> = {
  subject_extraction: "Extracting subject",
  subject_selection: "Selecting subject",
  topic_extraction: "Extracting topics",
  topic_selection: "Selecting topics",
  topic_expansion: "Expanding topics",
  build_topic_graph: "Generating topics graph",
}

function toQueueStatus(status: StepStatus): QueueTodo["status"] {
  return status === "complete" ? "completed" : "pending"
}

function deriveTodos(
  currentStepId: WizardStepId,
  agentStatuses: Record<AgentNodeId, StepStatus>,
): QueueTodo[] {
  const uploadDone =
    currentStepId === "preview" || currentStepId === "agentic"
  const previewDone = currentStepId === "agentic"

  return [
    {
      id: "upload",
      title: "Upload & process document",
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
  ]
}

export default function Wizard() {
  const params = useParams()
  const chatId = (params.chatId ?? params.id) as string | undefined

  const [hydrated, setHydrated] = useState(false)
  const [step, setStep] = useState<WizardStepId>("upload")

  useEffect(() => {
    if (!chatId) {
      setHydrated(true)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(
          `/api/chat/${encodeURIComponent(chatId)}/study`,
        )
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          study?: { wizardStep?: string; status?: string }
        } | null

        if (cancelled) return

        if (data?.ok && data.study) {
          setStep(
            resolveWizardStep({
              wizardStep: data.study.wizardStep,
              status: data.study.status,
            }),
          )
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [chatId])

  const stepper = wizardSteps.useStepper({
    step: hydrated ? step : undefined,
    defaultStep: "upload",
    beforeStepChange: (ctx) => {
      if (
        ctx.direction === "prev" ||
        ctx.direction === "reset" ||
        ctx.toIndex < ctx.fromIndex
      ) {
        return false
      }
      return true
    },
    onStepChange: (id, ctx) => {
      if (!isWizardStepId(id)) return
      setStep(id)
      if (
        chatId &&
        ctx.toIndex > ctx.fromIndex &&
        (ctx.direction === "next" || ctx.direction === "goto")
      ) {
        void patchWizardStep(chatId, id)
      }
    },
  })

  const currentStepId = isWizardStepId(stepper.id) ? stepper.id : step

  const agent = useTopicSelectionFromHash(chatId, {
    enabled: hydrated && currentStepId === "agentic",
  })

  const todos = useMemo(
    () => deriveTodos(currentStepId, agent.statuses),
    [currentStepId, agent.statuses],
  )
  const pendingCount = todos.filter((t) => t.status !== "completed").length
  const completedCount = todos.length - pendingCount
  const queueComplete =
    currentStepId === "agentic" && agent.selectionPersisted

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
        Restoring study progress…
      </div>
    )
  }

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
                ? "Preferences saved — opening live session…"
                : `${completedCount}/${todos.length} complete${
                    pendingCount > 0 ? ` · ${pendingCount} remaining` : ""
                  }`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[min(60vh,22rem)] overflow-y-auto px-2 py-2">
            <ul className="flex flex-col gap-0.5">
              {todos.map((todo) => {
                const completed = todo.status === "completed"
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
                )
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
