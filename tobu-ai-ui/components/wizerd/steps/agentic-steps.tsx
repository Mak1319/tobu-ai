"use client";

import {
    ChainOfThoughtHeader,
    ChainOfThoughtContent,
    ChainOfThoughtStep,
    ChainOfThoughtSearchResults,
    ChainOfThoughtSearchResult,
    ChainOfThought,
} from "@/components/ai/chain-of-thought";
import { Suggestion, Suggestions } from "@/components/ai/suggestion";
import { AGENT_NODES, type AgentNodeId } from "@/lib/ag-ui/agent-nodes";
import type { AgentNodeSyncState } from "@/lib/ag-ui/use-agent-nodes";

type AgenticStepsProps = {
    agent: AgentNodeSyncState;
};

export default function AgenticSteps({ agent }: AgenticStepsProps) {
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
        resumeSelection,
    } = agent;

    const awaitingSubject =
        interrupt?.type === "subject_selection" &&
        statuses.subject_selection === "active";
    const awaitingTopics =
        interrupt?.type === "topic_selection" &&
        statuses.topic_selection === "active";

    return (
        <div className="flex min-h-full w-full items-center justify-center">
            <ChainOfThought className="w-md max-w-md" defaultOpen>
                <ChainOfThoughtHeader>Agent is working</ChainOfThoughtHeader>
                <ChainOfThoughtContent>
                    {error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    {AGENT_NODES.map((node, index) => {
                        if (
                            index > activeIndex &&
                            statuses[node.id] === "pending"
                        ) {
                            return null;
                        }

                        const status = statuses[node.id as AgentNodeId];

                        return (
                            <ChainOfThoughtStep
                                key={node.id}
                                icon={node.icon}
                                label={node.label}
                                status={status}
                            >
                                {node.id === "subject_extraction" &&
                                    subjects.length > 0 && (
                                        <ChainOfThoughtSearchResults>
                                            {subjects.map((subject) => (
                                                <ChainOfThoughtSearchResult
                                                    key={subject}
                                                >
                                                    {subject}
                                                </ChainOfThoughtSearchResult>
                                            ))}
                                        </ChainOfThoughtSearchResults>
                                    )}

                                {node.id === "subject_selection" &&
                                    awaitingSubject && (
                                        <Suggestions>
                                            {subjects.map((subject) => (
                                                <Suggestion
                                                    key={subject}
                                                    suggestion={subject}
                                                    onClick={(value) => {
                                                        void resumeSelection(
                                                            value,
                                                        );
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
                                                <ChainOfThoughtSearchResult
                                                    key={topic.id}
                                                >
                                                    {topic.name}
                                                </ChainOfThoughtSearchResult>
                                            ))}
                                        </ChainOfThoughtSearchResults>
                                    )}

                                {node.id === "topic_selection" &&
                                    awaitingTopics && (
                                        <Suggestions>
                                            {extractedTopics.map((topic) => (
                                                <Suggestion
                                                    key={topic.id}
                                                    suggestion={topic.name}
                                                    onClick={(value) => {
                                                        void resumeSelection([
                                                            value,
                                                        ]);
                                                    }}
                                                />
                                            ))}
                                        </Suggestions>
                                    )}

                                {node.id === "topic_selection" &&
                                    selectedTopics.length > 0 &&
                                    !awaitingTopics && (
                                        <ChainOfThoughtSearchResults>
                                            {selectedTopics.map((topic) => (
                                                <ChainOfThoughtSearchResult
                                                    key={topic}
                                                >
                                                    {topic}
                                                </ChainOfThoughtSearchResult>
                                            ))}
                                        </ChainOfThoughtSearchResults>
                                    )}

                                {node.id === "topic_expansion" &&
                                    expandedTopics.length > 0 && (
                                        <ChainOfThoughtSearchResults>
                                            {expandedTopics.map((topic) => (
                                                <ChainOfThoughtSearchResult
                                                    key={topic.id}
                                                >
                                                    {topic.name}
                                                </ChainOfThoughtSearchResult>
                                            ))}
                                        </ChainOfThoughtSearchResults>
                                    )}
                            </ChainOfThoughtStep>
                        );
                    })}
                </ChainOfThoughtContent>
            </ChainOfThought>
        </div>
    );
}
