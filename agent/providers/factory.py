"""Runtime entry point for turning a user id into a ready chat model.

Nothing in the graph/node code imports a vendor SDK directly -- every node
calls `get_chat_model_for_user(user_id)` and lets this module resolve the
provider, credentials, and model name from MongoDB (falling back to the
deployment defaults in `config.settings` when the user has no saved
preference). This is what makes the provider choice a pure runtime concern.
"""

from __future__ import annotations

from langchain_core.language_models.chat_models import BaseChatModel

from config.settings import get_settings
from persistence.mongodb.preferences import get_user_model_preferences
from providers.models import ProviderConfig, ProviderName
from providers.registry import get_builder


def _default_config() -> ProviderConfig:
    settings = get_settings()
    provider = ProviderName(settings.default_model_provider)
    api_key = {
        ProviderName.OPENAI: settings.openai_api_key,
        ProviderName.ANTHROPIC: settings.anthropic_api_key,
        ProviderName.GOOGLE: settings.google_api_key,
        ProviderName.OLLAMA: None,
    }[provider]
    return ProviderConfig(
        provider=provider,
        model=settings.default_model_name,
        api_key=api_key,
        base_url=settings.ollama_base_url if provider == ProviderName.OLLAMA else None,
        temperature=settings.default_model_temperature,
    )


def get_provider_config_for_user(user_id: str | None) -> ProviderConfig:
    """Look up the user's saved provider preference, falling back to defaults."""
    if user_id:
        stored = get_user_model_preferences(user_id)
        if stored is not None:
            return stored
    return _default_config()


def get_chat_model(config: ProviderConfig) -> BaseChatModel:
    builder = get_builder(config.provider)
    return builder(config)


def get_chat_model_for_user(user_id: str | None) -> BaseChatModel:
    config = get_provider_config_for_user(user_id)
    return get_chat_model(config)
