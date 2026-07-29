"""Bridge between a LiveKit voice turn and the LangGraph adaptive-quiz workflow.

Every user utterance (after STT) eventually calls
:func:`run_quiz_graph`. The function:

1. Looks up -- or lazily creates -- a ``thread_id`` for the LiveKit room.
2. Resolves the syllabus text once via ``livekit_sessions`` + the existing
   ``services.syllabus_service`` (which falls back to fetching the
   docling-processed markdown from MinIO).
3. Streams the graph with ``stream_mode="updates"`` so we can observe
   ``__interrupt__`` chunks and convert them into spoken prompts.
4. If the stream pauses on an interrupt, returns the prompt as plain text
   so the agent says it; the *next* user utterance will be forwarded to
   the graph as a ``Command(resume=...)`` thanks to the cached
   ``thread_id``.
5. If the stream produces a ``summary`` field on the final state, returns
   that for the agent to speak.

We intentionally keep the entry point synchronous from LiveKit's
perspective. ``AgentSession`` runs LLM-bound tool calls in a worker
thread, so blocking here doesn't freeze the audio pipeline.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command

from graph import build_graph
from persistence.mongodb import livekit_sessions
from services.syllabus_service import load_syllabus
from state import AgentState

log = logging.getLogger("livekit-agent.langgraph_tool")

# Heuristic: anything shorter than this is almost certainly a one-word
# answer, not raw syllabus text. Lets the first user turn bootstrap the
# workflow when the upload finished before the call joined.
SYLLABUS_MIN_CHARS = 200


def _room_to_chat_id(room_name: str) -> str:
    """Reverse the convention used by the Next.js token route."""
    prefix = "chat-"
    return room_name[len(prefix):] if room_name.startswith(prefix) else room_name


def _compile_app_via_context() -> CompiledStateGraph:
    # Compiles a graph bound to a MongoDB checkpointer. The context manager
    # keeps the saver alive for the duration of the call.
    with get_checkpointer() as checkpointer:
        return build_graph().compile(checkpointer=checkpointer)


def _ensure_syllabus(
    room_name: str,
    user_id: str,
    chat_id: str,
    user_message: str,
) -> str:
    """Resolve and cache the syllabus text for this room."""
    session = livekit_sessions.get_session(room_name) or {}
    existing = session.get("syllabus_text")
    if existing:
        return existing

    object_key = session.get("object_key")
    if object_key:
        try:
            syllabus = load_syllabus(object_key=object_key)
            livekit_sessions.upsert_session(
                room_name,
                user_id=user_id,
                chat_id=chat_id,
                syllabus_text=syllabus.text,
                object_key=object_key,
            )
            return syllabus.text
        except Exception as exc:  # pragma: no cover -- depends on MinIO
            log.warning("could not load syllabus from %s: %s", object_key, exc)

    # Fall back to treating the first long user utterance as syllabus text.
    if user_message and len(user_message) >= SYLLABUS_MIN_CHARS:
        livekit_sessions.upsert_session(
            room_name,
            user_id=user_id,
            chat_id=chat_id,
            syllabus_text=user_message,
        )
        return user_message

    raise RuntimeError(
        "No syllabus is associated with this room yet. "
        "Upload a document in the chat wizard and try again."
    )


def _interrupt_to_prompt(interrupt_payload: Any) -> str:
    """Turn a `langgraph.types.interrupt` payload into something to read aloud."""
    if not isinstance(interrupt_payload, dict):
        return str(interrupt_payload)

    kind = interrupt_payload.get("type")
    message = interrupt_payload.get("message") or ""

    if kind == "select_subject":
        options = interrupt_payload.get("options") or []
        if options:
            options_phrase = ", ".join(str(o) for o in options)
            return f"{message} Your choices are: {options_phrase}."
        return message or "Please pick a subject."

    if kind == "select_topic":
        options = interrupt_payload.get("options") or []
        if options:
            options_phrase = ", ".join(str(o) for o in options)
            return f"{message} Your choices are: {options_phrase}."
        return message or "Please pick a topic."

    if kind == "answer_question":
        question = interrupt_payload.get("question") or ""
        return question or message or "Please answer the question."

    if kind == "continue_session":
        last = interrupt_payload.get("last_round_summary") or {}
        avg = last.get("average_score")
        if avg is not None:
            return (
                f"{message} Your last round average score was {avg:.0%}."
                if isinstance(avg, float)
                else f"{message} Your last round average score was {avg}."
            )
        return message or "Would you like another round?"

    return message or str(interrupt_payload)


def _stream_for_prompt(
    app: CompiledStateGraph,
    state: AgentState,
    config: RunnableConfig,
    user_message: str | None,
) -> str:
    """Drive the graph until it either finishes or pauses on an interrupt.

    Returns either:
      * the stringified final ``summary`` (if the run finished), or
      * a spoken prompt describing the interrupt (if it paused).
    """
    payload: dict[str, Any] = dict(state)
    if user_message is not None:
        # First utterance (or a resume) -> seed the chat and let the
        # graph route from `extract_subjects`.
        payload["chat_input"] = user_message

    final_summary: str | None = None
    interrupted_prompt: str | None = None

    for event in app.stream(payload, config=config, stream_mode="updates"):
        for node_name, update in event.items():
            if node_name == "__interrupt__":
                interrupts = update if isinstance(update, (list, tuple)) else [update]
                for interrupt_ in interrupts:
                    interrupted_prompt = _interrupt_to_prompt(interrupt_.value)
                continue
            if not isinstance(update, dict):
                continue
            summary = update.get("summary")
            if isinstance(summary, dict) and summary:
                # Last write wins; the graph only writes a non-empty summary
                # on the finalize node.
                final_summary = _format_summary(summary)

    if interrupted_prompt:
        return interrupted_prompt
    if final_summary:
        return final_summary
    return "I have nothing to say just yet -- give me a moment and try again."


def _format_summary(summary: dict[str, Any]) -> str:
    """Best-effort spoken readback of the final summary block."""
    parts: list[str] = []
    if "average_score" in summary:
        score = summary["average_score"]
        parts.append(f"Your overall average score was {score}.")
    if "topics_covered" in summary and isinstance(summary["topics_covered"], list):
        topics = ", ".join(str(t) for t in summary["topics_covered"])
        if topics:
            parts.append(f"Topics covered: {topics}.")
    if "rounds" in summary:
        parts.append(f"You completed {summary['rounds']} rounds.")
    return " ".join(parts) or "All done. Great work today."


def run_quiz_graph(
    *,
    room_name: str,
    user_id: str,
    user_message: str | None,
    resume_value: Any | None = None,
) -> str:
    """Process one user turn against the LangGraph workflow.

    Parameters
    ----------
    room_name:
        LiveKit room name -- always ``chat-{chatId}`` in this app.
    user_id:
        Authenticated user id from the LiveKit JWT claims.
    user_message:
        The latest STT-transcribed user utterance. ``None`` when the agent
        is just nudging the workflow forward.
    resume_value:
        When set, this turn is treated as the answer to the most recent
        ``interrupt()`` and is forwarded as ``Command(resume=...)``.
    """
    chat_id = _room_to_chat_id(room_name)

    # Make sure the room has a thread_id before we do anything else.
    session = livekit_sessions.get_session(room_name) or {}
    thread_id = session.get("thread_id") or str(uuid.uuid4())
    livekit_sessions.upsert_session(
        room_name,
        user_id=user_id,
        chat_id=chat_id,
        thread_id=thread_id,
    )

    syllabus_text = _ensure_syllabus(room_name, user_id, chat_id, user_message or "")

    state: AgentState = {
        "syllabus_text": syllabus_text,
        "user_id": user_id,
        "round_number": 0,
    }

    config = RunnableConfig(configurable={"thread_id": thread_id})

    app = _compile_app_via_context()
    if resume_value is not None:
        result = app.invoke(Command(resume=resume_value), config=config)
        if isinstance(result, dict):
            summary = result.get("summary")
            if isinstance(summary, dict) and summary:
                return _format_summary(summary)
            # Still paused after resume -- surface the next interrupt prompt.
            interrupts = result.get("__interrupt__")
            if interrupts:
                return _interrupt_to_prompt(interrupts[0].value)
        return "Got it. What would you like to do next?"

    return _stream_for_prompt(app, state, config, user_message)