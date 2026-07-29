"""Ollama adapter -- builds a `ChatOllama` from a `ProviderConfig`.

Useful for self-hosted / offline model providers where `api_key` is unused
and `base_url` points at a local or private Ollama server instead.
"""

from __future__ import annotations

from langchain_ollama import ChatOllama

from providers.models import ProviderConfig


def build(config: ProviderConfig) -> ChatOllama:
    return ChatOllama(
        model=config.model,
        base_url=config.base_url,
        temperature=config.temperature,
    )
