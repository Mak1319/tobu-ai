"""Reads a user's chosen LLM provider + credentials from MongoDB.

`tobu-ai-ui` is expected to write into this collection whenever a user picks
a provider in the chat wizard's "Model" step (see
`app/(dashboard)/chat/_wizard/step-2/1/page.tsx`). This module never decides
which provider to use -- it only fetches what's already stored, and lets
`providers.factory` fall back to deployment defaults when nothing is
saved yet.
"""

from __future__ import annotations

from persistence.mongodb.client import get_database
from persistence.mongodb.models import MODEL_PREFERENCES_COLLECTION
from providers.models import ProviderConfig, ProviderName


def get_user_model_preferences(user_id: str) -> ProviderConfig | None:
    db = get_database()
    doc = db[MODEL_PREFERENCES_COLLECTION].find_one({"user_id": user_id})
    if not doc:
        return None
    return ProviderConfig(
        provider=ProviderName(doc["provider"]),
        model=doc["model"],
        api_key=doc.get("api_key"),
        base_url=doc.get("base_url"),
        temperature=doc.get("temperature", 0.3),
        max_tokens=doc.get("max_tokens"),
    )


def save_user_model_preferences(user_id: str, config: ProviderConfig) -> None:
    db = get_database()
    db[MODEL_PREFERENCES_COLLECTION].update_one(
        {"user_id": user_id},
        {
            "$set": {
                "provider": config.provider.value,
                "model": config.model,
                "api_key": config.api_key,
                "base_url": config.base_url,
                "temperature": config.temperature,
                "max_tokens": config.max_tokens,
            }
        },
        upsert=True,
    )
