"""Pydantic models describing a user's chosen LLM provider + credentials."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class ProviderName(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OLLAMA = "ollama"


class ProviderConfig(BaseModel):
    """Everything an adapter needs to build a chat model instance.

    Fetched at runtime from MongoDB (per-user preference) or falls back to
    `config.settings.Settings` defaults when the user has none saved.
    """

    provider: ProviderName
    model: str
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int | None = None
