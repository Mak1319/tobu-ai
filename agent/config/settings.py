"""Centralized runtime configuration for the agent.

Values are read from environment variables (populated via `.env` in this
directory when running locally, or real environment variables when running
inside docker-compose). Nothing here hardcodes secrets -- populate
`agent/.env` locally using `agent/.env.example` as a template.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- MongoDB (checkpointer + user preferences) ----
    mongo_initdb_root_username: str = Field(
        default="admin", alias="MONGO_INITDB_ROOT_USERNAME"
    )
    mongo_initdb_root_password: str = Field(
        default="", alias="MONGO_INITDB_ROOT_PASSWORD"
    )
    mongo_host: str = Field(default="localhost", alias="MONGO_HOST")
    mongo_port: int = Field(default=27017, alias="MONGO_PORT")
    mongo_db_name: str = Field(default="imbbox2_agent", alias="MONGO_DB_NAME")
    mongo_uri_override: str | None = Field(default=None, alias="MONGO_URI")

    # ---- MinIO (syllabus source file downloads) ----
    minio_root_user: str = Field(default="admin", alias="MINIO_ROOT_USER")
    minio_root_password: str = Field(default="", alias="MINIO_ROOT_PASSWORD")
    minio_endpoint: str = Field(default="localhost:9000", alias="MINIO_ENDPOINT")
    minio_secure: bool = Field(default=False, alias="MINIO_SECURE")
    minio_bucket: str = Field(default="documents-bucket", alias="MINIO_BUCKET")

    # ---- Default LLM provider (used only when a user has no stored preference) ----
    default_model_provider: str = Field(
        default="openai", alias="DEFAULT_MODEL_PROVIDER"
    )
    default_model_name: str = Field(default="gpt-4o-mini", alias="DEFAULT_MODEL_NAME")
    default_model_temperature: float = Field(
        default=0.3, alias="DEFAULT_MODEL_TEMPERATURE"
    )

    # Fallback provider API keys -- per-user credentials come from MongoDB and
    # always take priority over these when present.
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    google_api_key: str | None = Field(default=None, alias="GOOGLE_API_KEY")
    ollama_base_url: str = Field(
        default="http://localhost:11434", alias="OLLAMA_BASE_URL"
    )

    # ---- LiveKit (voice agent transport) ----
    # URL the LiveKit Agents worker dials -- "ws://livekit:7880" inside docker
    # compose, "ws://localhost:7880" from the host, or "wss://..." for cloud.
    livekit_url: str = Field(default="ws://localhost:7880", alias="LIVEKIT_URL")
    livekit_api_key: str = Field(default="devkey", alias="LIVEKIT_API_KEY")
    livekit_api_secret: str = Field(default="secret", alias="LIVEKIT_API_SECRET")
    # Plugin names registered with the LiveKit Agents framework. Kept
    # configurable so the same image can swap providers without rebuilding.
    livekit_stt_provider: str = Field(default="openai", alias="LIVEKIT_STT_PROVIDER")
    livekit_tts_provider: str = Field(default="openai", alias="LIVEKIT_TTS_PROVIDER")
    livekit_llm_provider: str = Field(default="openai", alias="LIVEKIT_LLM_PROVIDER")

    @property
    def mongo_uri(self) -> str:
        if self.mongo_uri_override:
            return self.mongo_uri_override
        return (
            f"mongodb://{self.mongo_initdb_root_username}:"
            f"{self.mongo_initdb_root_password}@{self.mongo_host}:{self.mongo_port}/"
            "?authSource=admin"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
