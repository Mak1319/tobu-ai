"""Maps a provider name to its adapter builder function.

Adding a new provider means writing one file in `providers/adapters/` and
registering it here -- nothing else in the codebase needs to change.
"""

from __future__ import annotations

from providers.adapters import anthropic, google, ollama, openai
from providers.base.protocol import ChatModelBuilder
from providers.models import ProviderName

_REGISTRY: dict[ProviderName, ChatModelBuilder] = {
    ProviderName.OPENAI: openai.build,
    ProviderName.ANTHROPIC: anthropic.build,
    ProviderName.GOOGLE: google.build,
    ProviderName.OLLAMA: ollama.build,
}


def get_builder(provider: ProviderName) -> ChatModelBuilder:
    try:
        return _REGISTRY[provider]
    except KeyError as exc:
        raise ValueError(f"No adapter registered for provider '{provider}'") from exc
