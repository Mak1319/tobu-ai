"""FastAPI server that exposes the AG-UI protocol to ``tobu-ai-ui``.

Endpoints
---------
* ``POST /api/agui/run`` -- accept a ``RunAgentInput`` from the frontend and
  stream AG-UI events back as ``text/event-stream``.
* ``GET  /api/agui/health`` -- liveness probe.

Syllabus resolution
-------------------
The browser doesn't have the raw syllabus text -- it only has the chatId and
a MinIO object key (set by the docling worker once the upload is processed).
This server looks the syllabus up via the same code path the LiveKit voice
worker uses, so chat and voice sessions share one syllabus resolution story.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from ag_ui.core import (
    EventType,
    RunAgentInput,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
)
from ag_ui.encoder import EventEncoder
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from persistence.mongodb import livekit_sessions
from services.syllabus_service import load_syllabus

from .agui import stream_run_as_agui_events

log = logging.getLogger("agent.agui_server")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [agent-agui] %(message)s",
)


def _resolve_syllabus(*, chat_id: str, user_id: str) -> tuple[str, str | None]:
    """Return ``(syllabus_text, thread_id)`` for the given chat.

    Thread lookup goes through the ``livekit_sessions`` collection -- the same
    store the LiveKit worker uses -- so a chat started in voice and then
    re-opened in the wizard reuses the same LangGraph thread.
    """
    room_name = f"chat-{chat_id}"
    session = livekit_sessions.get_session(room_name) or {}
    thread_id = session.get("thread_id")
    syllabus_text = session.get("syllabus_text")
    if syllabus_text:
        return syllabus_text, thread_id

    object_key = session.get("object_key")
    if object_key:
        syllabus = load_syllabus(object_key=object_key)
        livekit_sessions.upsert_session(
            room_name,
            user_id=user_id,
            chat_id=chat_id,
            syllabus_text=syllabus.text,
            object_key=object_key,
            thread_id=thread_id,
        )
        return syllabus.text, thread_id

    raise HTTPException(
        status_code=409,
        detail=(
            "No syllabus is associated with this chat yet. The docling worker "
            "may still be processing the upload, or the upload may have failed."
        ),
    )


def _extract_resume_value(input_data: RunAgentInput) -> Any:
    """Pull the resume value out of an AG-UI ``RunAgentInput``.

    ``ag-ui-protocol`` models ``resume`` as a list of ``ResumeEntry`` objects
    (interrupt-aware protocol). For our workflow each LangGraph ``interrupt``
    is a single pause, so we collapse the list down to the first resolved
    payload and pass it to ``Command(resume=...)``.
    """
    entries = getattr(input_data, "resume", None)
    if not entries:
        return None
    if not isinstance(entries, list):
        return None
    first = entries[0]
    if getattr(first, "status", None) == "resolved":
        return getattr(first, "payload", None)
    if getattr(first, "status", None) == "cancelled":
        # Forward a sentinel so the LangGraph node's interrupt() consumer
        # can branch on it; the workflow nodes default to a string answer
        # so we send empty text for now.
        return ""
    return getattr(first, "payload", None)


async def _event_generator(
    *,
    syllabus_text: str | None,
    user_id: str,
    thread_id: str | None,
    resume_value: Any | None,
    encoder: EventEncoder,
    run_id: str,
    thread_id_final: str,
):
    """Adapt the plain-dict generator from ``agui.stream_run_as_agui_events``
    to AG-UI event models and SSE-encoded strings.
    """
    for raw_event in stream_run_as_agui_events(
        syllabus_text=syllabus_text,
        user_id=user_id,
        thread_id=thread_id,
        resume_value=resume_value,
    ):
        event_type = raw_event.get("type")
        try:
            model = _dict_to_event_model(raw_event, run_id=run_id)
        except Exception as exc:  # pragma: no cover -- defensive
            log.exception("failed to encode event %r: %s", raw_event, exc)
            yield encoder.encode(
                RunErrorEvent(
                    type=EventType.RUN_ERROR,
                    message=f"failed to encode event: {exc}",
                )
            )
            continue
        if model is None:
            # Already a passthrough (e.g. RUN_FINISHED handled below).
            yield encoder.encode(
                RunErrorEvent(
                    type=EventType.RUN_ERROR,
                    message=f"unknown event type: {event_type}",
                )
            )
            continue
        yield encoder.encode(model)

    # Ensure the run always terminates with a RUN_FINISHED even if the
    # generator forgot (the generator does emit one, but this guards against
    # an early return / exception path).
    yield encoder.encode(
        RunFinishedEvent(
            type=EventType.RUN_FINISHED,
            thread_id=thread_id_final,
            run_id=run_id,
        )
    )


def _dict_to_event_model(raw: dict[str, Any], *, run_id: str):
    """Translate one plain-dict event into an ``ag_ui.core`` Pydantic model.

    Kept in a dedicated function so the SSE-encoding loop stays readable and
    so we can swap in additional event types (ToolCall*, etc.) later without
    re-shuffling streaming concerns.
    """
    event_type = raw.get("type")
    if event_type == "RUN_STARTED":
        return RunStartedEvent(
            type=EventType.RUN_STARTED,
            thread_id=raw["thread_id"],
            run_id=raw["run_id"],
        )
    if event_type == "RUN_FINISHED":
        return RunFinishedEvent(
            type=EventType.RUN_FINISHED,
            thread_id=raw["thread_id"],
            run_id=raw["run_id"],
        )
    if event_type == "RUN_ERROR":
        return RunErrorEvent(
            type=EventType.RUN_ERROR,
            message=raw.get("message", "unknown error"),
        )
    if event_type in {"STEP_STARTED", "STEP_FINISHED"}:
        from ag_ui.core import StepFinishedEvent, StepStartedEvent

        if event_type == "STEP_STARTED":
            return StepStartedEvent(
                type=EventType.STEP_STARTED,
                step_name=raw["step_name"],
            )
        return StepFinishedEvent(
            type=EventType.STEP_FINISHED,
            step_name=raw["step_name"],
        )
    if event_type == "STATE_SNAPSHOT":
        from ag_ui.core import StateSnapshotEvent

        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=raw.get("snapshot", {}),
        )
    if event_type == "MESSAGES_SNAPSHOT":
        from ag_ui.core import MessagesSnapshotEvent

        return MessagesSnapshotEvent(
            type=EventType.MESSAGES_SNAPSHOT,
            messages=raw.get("messages", []),
        )
    if event_type == "CUSTOM":
        from ag_ui.core import CustomEvent

        return CustomEvent(
            type=EventType.CUSTOM,
            name=raw.get("name", "custom"),
            value=raw.get("value"),
        )
    return None


def create_app() -> FastAPI:
    app = FastAPI(title="imbbox2 Agent AG-UI server", version="0.1.0")

    @app.get("/api/agui/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "service": "agent-agui"}

    @app.post("/api/agui/run")
    async def run_agent(
        input_data: RunAgentInput, request: Request
    ) -> StreamingResponse:
        # Resolve chat + user context from forwarded props. The frontend
        # always sends these in ``forwardedProps``; we keep them out of the
        # AG-UI wire shape so the protocol stays clean.
        forwarded = dict(input_data.forwarded_props or {})
        chat_id = forwarded.pop("chat_id", None)
        user_id = forwarded.pop("user_id", None) or input_data.thread_id

        if not chat_id or not user_id:
            raise HTTPException(
                status_code=400,
                detail="forwarded_props must include chat_id and user_id",
            )

        try:
            syllabus_text, existing_thread_id = _resolve_syllabus(
                chat_id=str(chat_id),
                user_id=str(user_id),
            )
        except HTTPException:
            raise
        except Exception as exc:
            log.exception("failed to resolve syllabus for chat=%s", chat_id)
            raise HTTPException(
                status_code=500,
                detail=f"failed to resolve syllabus: {exc}",
            ) from exc

        thread_id = input_data.thread_id or existing_thread_id
        resume_value = _extract_resume_value(input_data)
        # When there's a resume value, syllabus_text is moot (the graph is
        # already past the initial node).
        if resume_value is not None:
            syllabus_text = None

        encoder = EventEncoder(accept=request.headers.get("accept"))

        return StreamingResponse(
            _event_generator(
                syllabus_text=syllabus_text,
                user_id=str(user_id),
                thread_id=thread_id,
                resume_value=resume_value,
                encoder=encoder,
                run_id=input_data.run_id,
                thread_id_final=thread_id or input_data.thread_id,
            ),
            media_type=encoder.get_content_type(),
        )

    @app.exception_handler(HTTPException)
    async def _http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"ok": False, "error": exc.detail},
        )

    return app


app = create_app()
