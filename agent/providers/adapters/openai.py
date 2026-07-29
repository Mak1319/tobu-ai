# pyright: reportCallIssue=false
"""OpenAI adapter -- builds a `ChatOpenAI` from a `ProviderConfig`.

The `langchain_openai` pydantic model uses `max_completion_tokens` in its
stubs, but accepts the legacy `max_tokens` kwarg at runtime and remaps it.
Same for `base_url` -- it lives on the parent `BaseChatOpenAI` and isn't
visible to pyright through dynamic class generation. The runtime call is
correct; we silence the structural noise here.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from providers.models import ProviderConfig


def build(config: ProviderConfig) -> ChatOpenAI:
    return ChatOpenAI(
        model=config.model,
        api_key=config.api_key,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        base_url=config.base_url,
    )
