import { HttpAgent } from "@ag-ui/client";
// or whatever the current low-level client export is

export function createTopicAgentClient() {
    return new HttpAgent({
        url: process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:8000/agent",
    });
}
