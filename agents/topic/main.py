# main.py
from ag_ui.core import RunAgentInput
from ag_ui.encoder import EventEncoder
from ag_ui_langgraph import LangGraphAgent
from ag_ui_langgraph.endpoint import StreamingResponse
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

import database
from topic_graph import graph  # CompiledStateGraph

app = FastAPI(lifespan=database.lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# add_langgraph_fastapi_endpoint(
#     app=app,
#     agent=LangGraphAgent(
#         name="topic_agent",
#         description="Topic Agent with subject & topic selection",
#         graph=graph,
#         # emit_interrupt_outcome=True,
#     ),
#     path="/agent",
# )

agent = LangGraphAgent(
    name="topic_agent",
    description="Topic Agent with subject & topic selection",
    graph=graph,
    # emit_interrupt_outcome=True,
)


@app.post("/agent")
async def agent_endpoint(input_data: RunAgentInput, request: Request):
    # Create encoder (respects Accept header)
    encoder = EventEncoder(accept=request.headers.get("accept", "accept"))

    async def event_generator():
        try:
            async for event in agent.run(input_data):
                yield encoder.encode(event)

        except (ValueError, RuntimeError, TypeError, KeyError) as e:
            # Optional: emit error event
            from ag_ui.core import EventType, RunErrorEvent

            yield encoder.encode(
                RunErrorEvent(type=EventType.RUN_ERROR, message=str(e))
            )

    return StreamingResponse(
        event_generator(),
        media_type=encoder.get_content_type(),  # usually "text/event-stream"
    )


@app.get("/health")
def health():
    return {"status": "ok"}
