"""Minimal AG-UI protocol bridge (future work).

This module intentionally does NOT depend on the `tobu-ai-ui` Next.js app or
the `ag-ui-protocol` package yet -- per the project brief we're keeping the
agent self-contained for now and will wire this up to the UI in a follow-up
pass. It exists so the eventual integration has an obvious home and a shape
to fill in.

The generator below turns a LangGraph `.stream(...)` run into a sequence of
AG-UI-style event dicts (see https://docs.ag-ui.com/concepts/events). Swap
the plain dicts for real `ag_ui.core` event models once that package is
added as a dependency and this is exposed over an HTTP/SSE route.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

from langchain_core.runnables import RunnableConfig

from checkpointer import get_checkpointer
from graph import build_graph


def stream_run_as_agui_events(
    syllabus_text: str, user_id: str, thread_id: str | None = None
) -> Iterator[dict[str, Any]]:
    """Yield AG-UI-shaped events for a single graph run.

    TODO(agui-integration): once `tobu-ai-ui` is ready to consume this,
    replace the plain dicts with `ag_ui.core` event models and expose this
    over a FastAPI route (e.g. `POST /api/agui/run`) that streams
    Server-Sent Events back to the chat wizard.
    """
    thread_id = thread_id or str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    config = RunnableConfig(configurable={"thread_id": thread_id})

    yield {"type": "RUN_STARTED", "run_id": run_id, "thread_id": thread_id}

    with get_checkpointer() as checkpointer:
        app = build_graph().compile(checkpointer=checkpointer)
        for event in app.stream(
            {"syllabus_text": syllabus_text, "user_id": user_id, "round_number": 0},
            config=config,
            stream_mode="updates",
        ):
            for node_name, update in event.items():
                if node_name == "__interrupt__":
                    for interrupt_ in update:
                        yield {
                            "type": "CUSTOM",
                            "name": "human_input_required",
                            "value": interrupt_.value,
                        }
                    continue
                yield {"type": "STATE_DELTA", "node": node_name, "delta": update}

    yield {"type": "RUN_FINISHED", "run_id": run_id, "thread_id": thread_id}
