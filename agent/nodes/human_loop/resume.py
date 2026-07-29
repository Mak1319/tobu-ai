"""Helpers for resuming an interrupted graph run from the outside (CLI, API).

`interrupt()` pauses a node; the caller resumes it by invoking the graph
again with a `Command(resume=...)` against the same `thread_id`.
"""

from __future__ import annotations

from langgraph.types import Command


def build_resume_command(value: object) -> Command[object]:
    return Command(resume=value)
