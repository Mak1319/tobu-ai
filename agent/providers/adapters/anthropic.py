# pyright: reportCallIssue=false
"""Anthropic adapter -- builds a `ChatAnthropic` from a `ProviderConfig`.

`ChatAnthropic` uses a pydantic model whose `model` and `max_tokens` fields
aren't visible through the dynamic stubs pyright picks up, but the runtime
constructor accepts them. Silenced locally to keep the call site readable.
"""

from __future__ import annotations

from langchain_anthropic import ChatAnthropic

from providers.models import ProviderConfig


def build(config: ProviderConfig) -> ChatAnthropic:
    return ChatAnthropic(
        model=config.model,
        api_key=config.api_key,
        temperature=config.temperature,
        max_tokens=config.max_tokens or 4096,
    )
