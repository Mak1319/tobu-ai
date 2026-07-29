"""Collection name constants + light document shape references.

No ODM here -- the agent only ever reads/writes a handful of documents, so
`pymongo` dicts in, dicts out is simpler than adding a modeling layer.
"""

from __future__ import annotations

MODEL_PREFERENCES_COLLECTION = "model_preferences"
"""Per-user LLM provider + credential preference. Document shape:

{
    "user_id": str,
    "provider": "openai" | "anthropic" | "google" | "ollama",
    "model": str,
    "api_key": str | None,
    "base_url": str | None,
    "temperature": float,
    "max_tokens": int | None,
}
"""

WORKFLOW_RUNS_COLLECTION = "workflow_runs"
"""Optional bookkeeping of started workflow runs (thread_id -> user_id, syllabus source)."""
