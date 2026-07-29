"""Convenience re-export -- the real implementation lives in
`persistence.mongodb.checkpoint` so all Mongo-specific code stays
grouped together under `persistence/`.
"""

from __future__ import annotations

from persistence.mongodb.checkpoint import get_checkpointer

__all__ = ["get_checkpointer"]
