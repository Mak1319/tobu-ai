"""Layer 5 schema -- the topic relationship graph.

Used by the progressive-question layer to find topics related to ones the
learner is weak on.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TopicGraphNode(BaseModel):
    id: str
    label: str = Field(default="")


class TopicGraphEdge(BaseModel):
    source: str
    target: str
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    relation: str = Field(default="related")


class TopicGraph(BaseModel):
    nodes: list[TopicGraphNode] = Field(default_factory=list)
    edges: list[TopicGraphEdge] = Field(default_factory=list)

    def neighbors(self, node_id: str) -> list[TopicGraphEdge]:
        return [e for e in self.edges if e.source == node_id or e.target == node_id]
