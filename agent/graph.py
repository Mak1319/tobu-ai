"""Builds the LangGraph `StateGraph` for the syllabus -> adaptive-quiz workflow.

Layers:
  1. Subject extraction        -> nodes.subject.extraction
  2. Subject selection (HITL)  -> nodes.subject.selection
  3. Topic extraction          -> nodes.topic.extraction
  4/5. Topic extension + graph -> nodes.topic.extension / graph_generation
  6. Topic selection (HITL)    -> nodes.topic.selection
  7. Question generation       -> nodes.question.generation
  8. Answer asking (HITL)      -> nodes.question.asking
  9. Answer analysis           -> nodes.assessment.answer_analysis
  10. Progressive questions    -> nodes.assessment.progressive_questions
      (loops back to layer 8 until the learner opts out via
      nodes.human_loop.interrupts.ask_continue_node)
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from nodes.assessment.answer_analysis import analyze_answers_node
from nodes.assessment.progressive_questions import (
    generate_progressive_questions_node,
)
from nodes.finalize_node import finalize_node
from nodes.human_loop.interrupts import ask_continue_node
from nodes.question.asking import ask_answers_node
from nodes.question.generation import generate_questions_node
from nodes.subject.extraction import extract_subjects_node
from nodes.subject.selection import select_subject_node
from nodes.topic.extension import extend_topics_node
from nodes.topic.extraction import extract_topics_node
from nodes.topic.graph_generation import generate_topic_graph_node
from nodes.topic.selection import select_topic_node
from state import AgentState


def _route_after_subject_extraction(state: AgentState) -> str:
    """No subjects at all (e.g. empty syllabus) ends the run immediately."""
    if state.get("no_subjects_found") or not state.get("subjects"):
        return END
    return "select_subject"


def _route_after_continue(state: AgentState) -> str:
    return (
        "generate_progressive_questions"
        if state.get("continue_session")
        else "finalize"
    )


def build_graph() -> StateGraph[AgentState]:
    graph = StateGraph(AgentState)

    graph = graph.add_node("extract_subjects", extract_subjects_node)
    graph = graph.add_node("select_subject", select_subject_node)
    graph = graph.add_node("extract_topics", extract_topics_node)
    graph = graph.add_node("extend_topics", extend_topics_node)
    graph = graph.add_node("generate_topic_graph", generate_topic_graph_node)
    graph = graph.add_node("select_topic", select_topic_node)
    graph = graph.add_node("generate_questions", generate_questions_node)
    graph = graph.add_node("ask_answers", ask_answers_node)
    graph = graph.add_node("analyze_answers", analyze_answers_node)
    graph = graph.add_node("ask_continue", ask_continue_node)
    graph = graph.add_node(
        "generate_progressive_questions", generate_progressive_questions_node
    )
    graph = graph.add_node("finalize", finalize_node)

    graph.set_entry_point("extract_subjects")

    graph = graph.add_conditional_edges(
        "extract_subjects",
        _route_after_subject_extraction,
        {END: END, "select_subject": "select_subject"},
    )
    graph = graph.add_edge("select_subject", "extract_topics")
    graph = graph.add_edge("extract_topics", "extend_topics")
    graph = graph.add_edge("extend_topics", "generate_topic_graph")
    graph = graph.add_edge("generate_topic_graph", "select_topic")
    graph = graph.add_edge("select_topic", "generate_questions")
    graph = graph.add_edge("generate_questions", "ask_answers")
    graph = graph.add_edge("ask_answers", "analyze_answers")
    graph = graph.add_edge("analyze_answers", "ask_continue")
    graph = graph.add_conditional_edges(
        "ask_continue",
        _route_after_continue,
        {
            "generate_progressive_questions": "generate_progressive_questions",
            "finalize": "finalize",
        },
    )
    graph = graph.add_edge("generate_progressive_questions", "ask_answers")
    graph = graph.add_edge("finalize", END)

    return graph
