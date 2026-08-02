"""FastAPI entrypoints for quiz LangGraph agents."""

from ag_ui.core import RunAgentInput
from ag_ui.encoder import EventEncoder
from ag_ui_langgraph import LangGraphAgent
from ag_ui_langgraph.endpoint import StreamingResponse
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

import database
from answer_analyzer_agent.graph import graph as analyzer_graph
from livekit_voice_user_interaction_agent.graph import graph as livekit_graph
from question_generator_agent.graph import graph as question_graph

app = FastAPI(lifespan=database.lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

livekit_agent = LangGraphAgent(
    name="livekit_voice_user_interaction_agent",
    description="Voice quiz orchestrator: greet, ask, score, progress",
    graph=livekit_graph,
)

question_agent = LangGraphAgent(
    name="question_generator_agent",
    description="Progressive question generator over a topic graph",
    graph=question_graph,
)

analyzer_agent = LangGraphAgent(
    name="answer_analyzer_agent",
    description="Scores answers and stores score deltas",
    graph=analyzer_graph,
)


def _stream_endpoint(agent: LangGraphAgent):
    async def endpoint(input_data: RunAgentInput, request: Request):
        encoder = EventEncoder(accept=request.headers.get("accept", "accept"))

        async def event_generator():
            try:
                async for event in agent.run(input_data):
                    yield encoder.encode(event)
            except (ValueError, RuntimeError, TypeError, KeyError) as e:
                from ag_ui.core import EventType, RunErrorEvent

                yield encoder.encode(
                    RunErrorEvent(type=EventType.RUN_ERROR, message=str(e))
                )

        return StreamingResponse(
            event_generator(),
            media_type=encoder.get_content_type(),
        )

    return endpoint


app.post("/agent")(_stream_endpoint(livekit_agent))
app.post("/agent/question-generator")(_stream_endpoint(question_agent))
app.post("/agent/answer-analyzer")(_stream_endpoint(analyzer_agent))


@app.get("/health")
def health():
    redis_ok = False
    try:
        from shared.redis_bus import get_bus

        get_bus().client.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {
        "status": "ok" if redis_ok else "degraded",
        "redis": redis_ok,
        "stream": "quiz_agent_bus",
    }
