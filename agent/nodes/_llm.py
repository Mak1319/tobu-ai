"""Shared helper for invoking a user's chosen chat model with structured output.

Every LLM-backed node goes through this function so the provider-selection
logic (`providers.factory`) only needs to be wired up once.
"""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from providers.factory import get_chat_model_for_user

T = TypeVar("T", bound=BaseModel)


def structured_llm_call(user_id: str | None, prompt: str, schema: type[T]) -> T:
    """Invoke the user's configured chat model and parse the response into `schema`."""
    model = get_chat_model_for_user(user_id)
    structured_model = model.with_structured_output(schema)
    result = structured_model.invoke(prompt)
    if isinstance(result, schema):
        return result
    return schema.model_validate(result)
