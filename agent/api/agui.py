"""AG-UI protocol bridge for the existing LangGraph workflow.

Translates a LangGraph ``.stream(...)`` run into a sequence of AG-UI events
(see https://docs.ag-ui.com/concepts/events). The shape of each AG-UI event
matches ``ag_ui.core`` Pydantic models; this module produces dicts so callers
can choose to:

* Encode them with ``ag_ui.encoder.EventEncoder`` (used by the FastAPI server
  in ``agui_server.py``), or
* Yield them as plain dicts for the legacy CLI/local path.

The events we emit are:

* ``RUN_STARTED`` / ``RUN_FINISHED`` -- run lifecycle.
* ``STEP_STARTED`` / ``STEP_FINISHED`` -- per-node transitions, so the UI can
  render "Extracting subjects..." / "Generating questions..." progress.
* ``STATE_SNAPSHOT`` -- the post-node LangGraph state, restricted to
  AG-UI-facing keys (subjects / topics / questions / answers / summary).
* ``MESSAGES_SNAPSHOT`` -- a synthetic message log built from the graph state,
  since this workflow does not use LangGraph's ``MessagesState``.
* ``CUSTOM(name=on_interrupt)`` -- human-in-the-loop pause notifications. Each
  interrupt payload is emitted as a separate event so the UI can render them
  in order; resume comes through ``RunAgentInput.resume`` and is forwarded as
  ``Command(resume=...)`` against the same ``thread_id``.
* ``CUSTOM(name=...)`` -- per-node progress events (subjects, topics,
  questions, summary) so the UI can stream rich state without parsing the
  full snapshot.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command

from checkpointer import get_checkpointer
from graph import build_graph

# Keys we surface to the AG-UI client. Everything else in LangGraph state is
# internal plumbing (round_number, error, etc.) and would only add noise.
AGUI_FACING_KEYS = (
    "subjects",
    "selected_subject",
    "no_subjects_found",
    "topics",
    "subtopics_by_topic",
    "selected_topic",
    "topic_graph",
    "current_questions",
    "user_answers",
    "round_number",
    "round_history",
    "continue_session",
    "summary",
)


def _filter_state(state: dict[str, Any]) -> dict[str, Any]:
    """Return a JSON-safe subset of the LangGraph state for the AG-UI snapshot."""
    out: dict[str, Any] = {}
    for key in AGUI_FACING_KEYS:
        if key in state:
            out[key] = state[key]
    return out


def _interrupt_to_agui_value(payload: Any) -> dict[str, Any]:
    """Convert a LangGraph ``interrupt()`` payload into the AG-UI custom-event
    ``value`` we ship to the client.

    The shape mirrors the existing ``livekit.langgraph_tool`` translation so
    voice and chat paths agree on what the human sees.
    """
    if not isinstance(payload, dict):
        return {"type": "generic", "message": str(payload)}

    kind = payload.get("type")
    if kind == "select_subject":
        return {
            "type": "select_subject",
            "message": payload.get("message")
            or "Multiple subjects were found. Which one would you like to study?",
            "options": list(payload.get("options") or []),
        }
    if kind == "select_topic":
        return {
            "type": "select_topic",
            "message": payload.get("message")
            or "Which topic would you like to focus on?",
            "options": list(payload.get("options") or []),
        }
    if kind == "answer_question":
        return {
            "type": "answer_question",
            "question_id": payload.get("question_id"),
            "question": payload.get("question", ""),
            "topic": payload.get("topic"),
        }
    if kind == "continue_session":
        return {
            "type": "continue_session",
            "message": payload.get("message")
            or "Would you like another round of questions?",
            "last_round_summary": payload.get("last_round_summary"),
        }
    return {"type": kind or "generic", "value": payload}


def _build_initial_messages(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Build a synthetic AG-UI message log from the LangGraph state.

    The workflow doesn't use ``MessagesState``; we still emit a coherent
    ``MESSAGES_SNAPSHOT`` so the AG-UI client has something to render
    immediately on connect.
    """
    messages: list[dict[str, Any]] = []
    selected = state.get("selected_subject")
    if selected is not None:
        name = getattr(selected, "name", None) or (
            selected.get("name") if isinstance(selected, dict) else None
        )
        if name:
            messages.append(
                {
                    "id": f"sys-subject-{uuid.uuid4()}",
                    "role": "assistant",
                    "content": f"Studying: {name}",
                }
            )
    selected_topic = state.get("selected_topic")
    if selected_topic:
        messages.append(
            {
                "id": f"sys-topic-{uuid.uuid4()}",
                "role": "assistant",
                "content": f"Focusing on: {selected_topic}",
            }
        )
    summary = state.get("summary")
    if isinstance(summary, dict) and summary:
        avg = summary.get("average_score")
        rounds = summary.get("rounds")
        if avg is not None or rounds is not None:
            messages.append(
                {
                    "id": f"sys-summary-{uuid.uuid4()}",
                    "role": "assistant",
                    "content": f"Quiz finished. {rounds or '?'} rounds, "
                    f"average score {avg}.",
                }
            )
    return messages


def _compile_app(checkpointer: Any) -> CompiledStateGraph:
    return build_graph().compile(checkpointer=checkpointer)


def _config_for(thread_id: str) -> RunnableConfig:
    return RunnableConfig(configurable={"thread_id": thread_id})


def _stream_graph(
    app: CompiledStateGraph,
    payload: dict[str, Any],
    config: RunnableConfig,
) -> Iterator[dict[str, Any]]:
    """Run the graph once and yield ``(node_name, update)`` events.

    The wrapping into AG-UI events (STEP_*, STATE_SNAPSHOT, CUSTOM) is the
    caller's job; this helper keeps the streaming concerns in one place.
    """
    for event in app.stream(payload, config=config, stream_mode="updates"):
        for node_name, update in event.items():
            yield node_name, update


def stream_run_as_agui_events(
    syllabus_text: str | None,
    user_id: str,
    thread_id: str | None = None,
    resume_value: Any | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield AG-UI-shaped events for a single graph run.

    Parameters
    ----------
    syllabus_text:
        Required for the first run on a thread. Ignored on resume.
    user_id:
        Used to look up the user's saved LLM provider/credentials.
    thread_id:
        Existing thread id when resuming; otherwise a fresh UUID is generated.
    resume_value:
        When set, this run resumes a paused graph (the previous run emitted a
        ``CUSTOM(on_interrupt)`` event); the value is forwarded as
        ``Command(resume=...)``.
    """
    thread_id = thread_id or str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    config = _config_for(thread_id)

    yield {
        "type": "RUN_STARTED",
        "run_id": run_id,
        "thread_id": thread_id,
    }

    with get_checkpointer() as checkpointer:
        app = _compile_app(checkpointer)

        if resume_value is not None:
            # Resume a paused run.
            interrupted = _drain_resume(app, config, resume_value)
            yield from _events_after_resume(interrupted, thread_id, run_id)
            return

        if not syllabus_text:
            yield {
                "type": "RUN_ERROR",
                "message": "syllabus_text is required for a new run",
            }
            yield {"type": "RUN_FINISHED", "run_id": run_id, "thread_id": thread_id}
            return

        payload: dict[str, Any] = {
            "syllabus_text": syllabus_text,
            "user_id": user_id,
            "round_number": 0,
        }
        final_state: dict[str, Any] = dict(payload)
        for node_name, update in _stream_graph(app, payload, config):
            if node_name == "__interrupt__":
                interrupts = update if isinstance(update, (list, tuple)) else [update]
                for interrupt_ in interrupts:
                    value = _interrupt_to_agui_value(
                        interrupt_.value if hasattr(interrupt_, "value") else interrupt_
                    )
                    yield {
                        "type": "CUSTOM",
                        "name": "on_interrupt",
                        "value": value,
                    }
                # Don't emit STEP_FINISHED for __interrupt__; the run is paused.
                continue
            yield {"type": "STEP_STARTED", "step_name": node_name}
            if isinstance(update, dict):
                final_state.update(update)
                yield {
                    "type": "STATE_SNAPSHOT",
                    "snapshot": _filter_state(final_state),
                }
                # A few nodes have a user-facing field worth surfacing as its
                # own CUSTOM event for richer UI rendering.
                for event in _custom_progress_events(node_name, update):
                    yield event
            yield {"type": "STEP_FINISHED", "step_name": node_name}

        yield {
            "type": "MESSAGES_SNAPSHOT",
            "messages": _build_initial_messages(final_state),
        }
        yield {
            "type": "STATE_SNAPSHOT",
            "snapshot": _filter_state(final_state),
        }

    yield {"type": "RUN_FINISHED", "run_id": run_id, "thread_id": thread_id}


def _custom_progress_events(
    node_name: str, update: dict[str, Any]
) -> Iterator[dict[str, Any]]:
    """Per-node CUSTOM events that the chat wizard renders as typed widgets."""
    if node_name == "extract_subjects":
        if update.get("no_subjects_found"):
            yield {
                "type": "CUSTOM",
                "name": "no_subjects_found",
                "value": {"message": "I couldn't find any subjects in that syllabus."},
            }
    elif node_name == "select_subject":
        chosen = update.get("selected_subject")
        if chosen is not None:
            yield {
                "type": "CUSTOM",
                "name": "subject_selected",
                "value": {
                    "name": getattr(chosen, "name", None)
                    or (chosen.get("name") if isinstance(chosen, dict) else None)
                },
            }
    elif node_name == "select_topic":
        chosen = update.get("selected_topic")
        if chosen:
            yield {
                "type": "CUSTOM",
                "name": "topic_selected",
                "value": {"topic": chosen},
            }
    elif (
        node_name == "generate_questions"
        or node_name == "generate_progressive_questions"
    ):
        questions = update.get("current_questions") or []
        if questions:
            yield {
                "type": "CUSTOM",
                "name": "questions_generated",
                "value": {
                    "count": len(questions),
                    "round_number": update.get("round_number"),
                },
            }
    elif node_name == "analyze_answers":
        history = update.get("round_history") or []
        if history:
            last = history[-1]
            last_dict = last.model_dump() if hasattr(last, "model_dump") else last
            yield {
                "type": "CUSTOM",
                "name": "round_analyzed",
                "value": last_dict,
            }
    elif node_name == "finalize":
        summary = update.get("summary")
        if summary:
            yield {
                "type": "CUSTOM",
                "name": "quiz_finished",
                "value": summary,
            }


def _drain_resume(
    app: CompiledStateGraph,
    config: RunnableConfig,
    resume_value: Any,
) -> list[Any]:
    """Run the graph with ``Command(resume=...)`` and capture any
    follow-up interrupts (e.g. the next question in a multi-interrupt node).
    """
    result = app.invoke(Command(resume=resume_value), config=config)
    interrupts: list[Any] = []
    if isinstance(result, dict):
        raw = result.get("__interrupt__")
        if raw:
            interrupts = list(raw) if isinstance(raw, (list, tuple)) else [raw]
    return interrupts


def _events_after_resume(
    interrupts: list[Any], thread_id: str, run_id: str
) -> Iterator[dict[str, Any]]:
    """Emit events that immediately follow a resume call."""
    for interrupt_ in interrupts:
        value = _interrupt_to_agui_value(
            interrupt_.value if hasattr(interrupt_, "value") else interrupt_
        )
        yield {"type": "CUSTOM", "name": "on_interrupt", "value": value}
    if not interrupts:
        # No further interrupt -- the run completed.
        yield {
            "type": "MESSAGES_SNAPSHOT",
            "messages": [
                {
                    "id": f"sys-resume-{uuid.uuid4()}",
                    "role": "assistant",
                    "content": "Got it.",
                }
            ],
        }
    yield {"type": "RUN_FINISHED", "run_id": run_id, "thread_id": thread_id}
