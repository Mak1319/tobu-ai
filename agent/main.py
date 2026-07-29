"""CLI / programmatic entrypoint for running the agent locally.

Run these from inside the `agent/` directory (where `pyproject.toml` and
`.venv` live). Typical flow:

    uv run python -m main start --syllabus-file path/to/syllabus.txt --user-id u123

When the run pauses on an `interrupt()`, this prints the interrupt payload
and exits; resume it with:

    uv run python -m main resume --thread-id <id> --value "some answer"
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command

from checkpointer import get_checkpointer
from graph import build_graph


def _compile_app(checkpointer: Any) -> CompiledStateGraph:
    return build_graph().compile(checkpointer=checkpointer)


def _config_for(thread_id: str) -> RunnableConfig:
    return RunnableConfig(configurable={"thread_id": thread_id})


def start_run(syllabus_text: str, user_id: str, thread_id: str | None = None) -> None:
    thread_id = thread_id or str(uuid.uuid4())

    with get_checkpointer() as checkpointer:
        app = _compile_app(checkpointer)
        result = app.invoke(
            {"syllabus_text": syllabus_text, "user_id": user_id, "round_number": 0},
            config=_config_for(thread_id),
        )
        _print_status(thread_id, result)


def resume_run(thread_id: str, value: object) -> None:
    with get_checkpointer() as checkpointer:
        app = _compile_app(checkpointer)
        result = app.invoke(Command(resume=value), config=_config_for(thread_id))
        _print_status(thread_id, result)


def _print_status(thread_id: str, result: dict[str, Any]) -> None:
    interrupts = result.get("__interrupt__")
    print(f"thread_id={thread_id}")
    if interrupts:
        print("Paused for human input:")
        for i in interrupts:
            print(json.dumps(i.value, indent=2, default=str))
    else:
        print("Run finished. Final state keys:", list(result.keys()))
        if "summary" in result:
            print(json.dumps(result["summary"], indent=2, default=str))


def _cli() -> None:
    parser = argparse.ArgumentParser(description="imbbox2 adaptive-quiz agent")
    sub = parser.add_subparsers(dest="command", required=True)

    start = sub.add_parser("start", help="Start a new workflow run")
    start.add_argument("--syllabus-file", type=Path, required=True)
    start.add_argument("--user-id", required=True)
    start.add_argument("--thread-id", default=None)

    resume = sub.add_parser("resume", help="Resume a paused workflow run")
    resume.add_argument("--thread-id", required=True)
    resume.add_argument("--value", required=True)

    args = parser.parse_args()

    if args.command == "start":
        syllabus_text = args.syllabus_file.read_text(encoding="utf-8")
        start_run(syllabus_text, args.user_id, args.thread_id)
    elif args.command == "resume":
        resume_run(args.thread_id, args.value)


if __name__ == "__main__":
    sys.exit(_cli() or 0)
