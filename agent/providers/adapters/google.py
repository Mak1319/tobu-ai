"""Google adapter -- builds a `ChatGoogleGenerativeAI` from a `ProviderConfig`."""

from __future__ import annotations

from langchain_google_genai import ChatGoogleGenerativeAI

from providers.models import ProviderConfig


def build(config: ProviderConfig) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=config.model,
        google_api_key=config.api_key,
        temperature=config.temperature,
        max_output_tokens=config.max_tokens,
    )
