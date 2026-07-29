"""Public service API for reading/writing a user's LLM provider preference.

Thin wrapper around `persistence.mongodb.preferences` so callers (e.g.
a future FastAPI route backing the `tobu-ai-ui` "Model" wizard step) don't
need to know about MongoDB collection names.
"""

from __future__ import annotations

from persistence.mongodb.preferences import (
    get_user_model_preferences,
    save_user_model_preferences,
)
from providers.models import ProviderConfig

__all__ = ["get_preferences", "set_preferences"]


def get_preferences(user_id: str) -> ProviderConfig | None:
    return get_user_model_preferences(user_id)


def set_preferences(user_id: str, config: ProviderConfig) -> None:
    save_user_model_preferences(user_id, config)
