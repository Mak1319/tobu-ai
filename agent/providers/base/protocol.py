"""Provider-agnostic contract every LLM adapter must satisfy.

The rest of the codebase only depends on this protocol + `ProviderConfig`,
never on a specific vendor SDK. This is what makes the provider decision a
pure runtime concern (looked up per-user from MongoDB) instead of a
build-time import.
"""

from __future__ import annotations

from typing import Protocol

from langchain_core.language_models.chat_models import BaseChatModel

from providers.models import ProviderConfig


class ChatModelBuilder(Protocol):
    """A callable that turns a `ProviderConfig` into a ready-to-use chat model."""

    def __call__(self, config: ProviderConfig) -> BaseChatModel: ...
