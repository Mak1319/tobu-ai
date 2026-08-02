"use client"

import { useParams, useRouter } from "next/navigation"
import {
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThought,
} from "@/components/ai/chain-of-thought"
import { Suggestion, Suggestions } from "@/components/ai/suggestion"
import { Button } from "@/components/ui/button"
import { AGENT_NODES, type AgentNodeId } from "@/lib/wizard/topic-selection"
import type { TopicSelectionState } from "@/lib/wizard/use-topic-selection"

type AgenticStepsProps = {
  agent: TopicSelectionState
}

export default function AgenticSteps({ agent }: AgenticStepsProps) {
  const router = useRouter()
  const params = useParams()
  const chatId = (params.chatId ?? params.id) as string | undefined

  const {
    statuses,
    activeIndex,
    subjects,
    extractedTopics,
    expandedTopics,
    selectedSubject,
    selectedTopics,
    interrupt,
    error,
    isRunning,
    canConfirm,
    resumeSelection,
    confirmAndStartLive,
  } = agent

  const awaitingSubject =
    interrupt?.type === "subject_selection" &&
    statuses.subject_selection === "active"
  const awaitingTopics =
    interrupt?.type === "topic_selection" &&
    statuses.topic_selection === "active"

  const onNext = async () => {
    if (!chatId) return
    const ok = await confirmAndStartLive()
    if (!ok) return
    router.replace(`/chat/${encodeURIComponent(chatId)}/live`)
  }

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-4 p-4">
      <ChainOfThought className="w-md max-w-md" defaultOpen>
        <ChainOfThoughtHeader>Select subject & topics</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {AGENT_NODES.map((node, index) => {
            if (index > activeIndex && statuses[node.id] === "pending") {
              return null
            }

            const status = statuses[node.id as AgentNodeId]

            return (
              <ChainOfThoughtStep
                key={node.id}
                icon={node.icon}
                label={node.label}
                status={status}
              >
                {node.id === "subject_extraction" && subjects.length > 0 && (
                  <ChainOfThoughtSearchResults>
                    {subjects.map((subject) => (
                      <ChainOfThoughtSearchResult key={subject}>
                        {subject}
                      </ChainOfThoughtSearchResult>
                    ))}
                  </ChainOfThoughtSearchResults>
                )}

                {node.id === "subject_selection" && awaitingSubject && (
                  <Suggestions>
                    {subjects.map((subject) => (
                      <Suggestion
                        key={subject}
                        suggestion={subject}
                        onClick={(value) => {
                          void resumeSelection(value)
                        }}
                      />
                    ))}
                  </Suggestions>
                )}

                {node.id === "subject_selection" &&
                  selectedSubject &&
                  !awaitingSubject && (
                    <ChainOfThoughtSearchResults>
                      <ChainOfThoughtSearchResult>
                        {selectedSubject}
                      </ChainOfThoughtSearchResult>
                    </ChainOfThoughtSearchResults>
                  )}

                {node.id === "topic_extraction" &&
                  extractedTopics.length > 0 && (
                    <ChainOfThoughtSearchResults>
                      {extractedTopics.map((topic) => (
                        <ChainOfThoughtSearchResult key={topic.id}>
                          {topic.name}
                        </ChainOfThoughtSearchResult>
                      ))}
                    </ChainOfThoughtSearchResults>
                  )}

                {node.id === "topic_selection" && awaitingTopics && (
                  <>
                    <p className="text-muted-foreground mb-2 text-xs">
                      Click topics to select (toggle). Then press Next.
                    </p>
                    <Suggestions>
                      {extractedTopics.map((topic) => (
                        <Suggestion
                          key={topic.id}
                          suggestion={topic.name}
                          onClick={(value) => {
                            void resumeSelection([value])
                          }}
                        />
                      ))}
                    </Suggestions>
                    {selectedTopics.length > 0 && (
                      <ChainOfThoughtSearchResults>
                        {selectedTopics.map((topic) => (
                          <ChainOfThoughtSearchResult key={topic}>
                            {topic}
                          </ChainOfThoughtSearchResult>
                        ))}
                      </ChainOfThoughtSearchResults>
                    )}
                  </>
                )}

                {node.id === "topic_selection" &&
                  selectedTopics.length > 0 &&
                  !awaitingTopics && (
                    <ChainOfThoughtSearchResults>
                      {selectedTopics.map((topic) => (
                        <ChainOfThoughtSearchResult key={topic}>
                          {topic}
                        </ChainOfThoughtSearchResult>
                      ))}
                    </ChainOfThoughtSearchResults>
                  )}

                {node.id === "topic_expansion" &&
                  expandedTopics.length > 0 && (
                    <ChainOfThoughtSearchResults>
                      {expandedTopics.map((topic) => (
                        <ChainOfThoughtSearchResult key={topic.id}>
                          {topic.name}
                        </ChainOfThoughtSearchResult>
                      ))}
                    </ChainOfThoughtSearchResults>
                  )}
              </ChainOfThoughtStep>
            )
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>

      <div className="flex w-md max-w-md justify-end">
        <Button
          type="button"
          onClick={() => {
            void onNext()
          }}
          disabled={!canConfirm || isRunning}
        >
          {isRunning ? "Saving…" : "Next — start voice session"}
        </Button>
      </div>
    </div>
  )
}
