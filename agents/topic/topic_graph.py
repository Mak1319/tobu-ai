# topic_graph.py
import asyncio
from typing import Any

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import MessagesState
from langgraph.types import interrupt
from pydantic import BaseModel, Field


class Subject(BaseModel):
    subject_name: str = Field(description="The name of the subject")
    subject_id: str = Field(
        description="The unique identifier of the subject , it must be in snake case"
    )
    description: str = Field(description="A brief description of the subject")
    subject_text: str = Field(
        description="The text content of the subject from the syllabus"
    )


class TopicState(MessagesState):
    document_content: str
    # Stub returns plain name strings; real LLM path can switch to Subject models.
    subjects: list[str]
    selected_subject: str | None
    topics: list[dict]
    selected_topics: list[str]
    topic_graph: dict | None
    status: str
    tools: list[Any]


async def emit_node_event(
    node: str,
    status: str,
    config: RunnableConfig,
    **data: Any,
) -> None:
    """Emit a UI-facing NODE_EVENT custom event (started | finished)."""
    await adispatch_custom_event(
        "NODE_EVENT",
        {
            "type": "node_event",
            "node": node,
            "status": status,
            **data,
        },
        config=config,
    )


async def subject_extraction(state: TopicState, config: RunnableConfig):
    await emit_node_event("subject_extraction", "started", config)
    await asyncio.sleep(2)

    subjects = ["Math", "Physics", "History"]
    await emit_node_event(
        "subject_extraction",
        "finished",
        config,
        subjects=subjects,
    )
    return {
        "status": "awaiting_subject",
        "subjects": subjects,
    }


async def subject_selection(state: TopicState, config: RunnableConfig):
    await emit_node_event("subject_selection", "started", config)
    selected = interrupt(
        {
            "type": "subject_selection",
            "candidates": state.get("subjects") or [],
            "message": "Select a subject",
        }
    )
    await emit_node_event(
        "subject_selection",
        "finished",
        config,
        selected_subject=selected,
    )
    return {"selected_subject": selected, "status": "subject_selected"}


async def topic_extraction(state: TopicState, config: RunnableConfig):
    await emit_node_event("topic_extraction", "started", config)
    await asyncio.sleep(2)

    topics = [{"id": "1", "name": "Algebra"}, {"id": "2", "name": "Geometry"}]
    await emit_node_event(
        "topic_extraction",
        "finished",
        config,
        topics=topics,
    )
    return {
        "topics": topics,
        "status": "awaiting_topic",
    }


async def topic_selection(state: TopicState, config: RunnableConfig):
    await emit_node_event("topic_selection", "started", config)
    selected = interrupt(
        {
            "type": "topic_selection",
            "candidates": state.get("topics") or [],
            "message": "Select topics",
        }
    )
    await emit_node_event(
        "topic_selection",
        "finished",
        config,
        selected_topics=selected,
    )
    return {"selected_topics": selected, "status": "topics_selected"}


async def topic_expansion(state: TopicState, config: RunnableConfig):
    await emit_node_event("topic_expansion", "started", config)
    await asyncio.sleep(2)

    topics = [{"id": "5", "name": "Calculus"}]
    await emit_node_event(
        "topic_expansion",
        "finished",
        config,
        topics=topics,
    )
    return {"topics": topics, "status": "awaiting_expansion"}


async def build_topic_graph(state: TopicState, config: RunnableConfig):
    await emit_node_event("build_topic_graph", "started", config)
    await asyncio.sleep(2)

    topic_graph = {
        "nodes": [
            {"id": "algebra", "label": "Algebra"},
            {"id": "geometry", "label": "Geometry"},
            {"id": "calculus", "label": "Calculus"},
        ],
        "edges": [
            {"from": "algebra", "to": "calculus"},
            {"from": "geometry", "to": "calculus"},
        ],
    }
    await emit_node_event(
        "build_topic_graph",
        "finished",
        config,
        topic_graph=topic_graph,
    )
    return {"topic_graph": topic_graph, "status": "done"}


builder = StateGraph(TopicState)
builder.add_node("subject_extraction", subject_extraction)
builder.add_node("subject_selection", subject_selection)
builder.add_node("topic_extraction", topic_extraction)
builder.add_node("topic_selection", topic_selection)
builder.add_node("topic_expansion", topic_expansion)
builder.add_node("build_topic_graph", build_topic_graph)

builder.add_edge(START, "subject_extraction")
builder.add_edge("subject_extraction", "subject_selection")
builder.add_edge("subject_selection", "topic_extraction")
builder.add_edge("topic_extraction", "topic_selection")
builder.add_edge("topic_selection", "topic_expansion")
builder.add_edge("topic_expansion", "build_topic_graph")
builder.add_edge("build_topic_graph", END)

graph = builder.compile(checkpointer=MemorySaver())
