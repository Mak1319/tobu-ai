# syntax=docker/dockerfile:1
# Single image for quiz API (uvicorn) and LiveKit voice worker (different CMD).

ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    HF_HOME=/app/.cache/huggingface \
    TORCH_HOME=/app/.cache/torch \
    PIPER_MODEL_PATH=/app/models/en_US-lessac-medium.onnx

FROM base AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
# Placeholder package dirs so hatchling/uv can resolve the project metadata.
RUN mkdir -p shared livekit_voice_user_interaction_agent \
    question_generator_agent answer_analyzer_agent \
  && touch shared/__init__.py \
    livekit_voice_user_interaction_agent/__init__.py \
    question_generator_agent/__init__.py \
    answer_analyzer_agent/__init__.py

RUN uv sync --locked

COPY . .
RUN uv sync --locked

# Piper TTS voice (onnx + config) — required for local voice stack.
RUN mkdir -p /app/models \
  && curl -fsSL -o /app/models/en_US-lessac-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx" \
  && curl -fsSL -o /app/models/en_US-lessac-medium.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

# Prefetch LiveKit plugin assets + Whisper model so first job is faster.
RUN uv run --module livekit.agents download-files || true
RUN uv run python -c "from faster_whisper import WhisperModel; WhisperModel('distil-small.en', device='cpu', compute_type='int8')"

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home "/app" \
  --shell "/sbin/nologin" \
  --uid "${UID}" \
  appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app

USER appuser
EXPOSE 8000

# Default: quiz FastAPI (+ Redis QG/AA workers via lifespan).
# Override for voice: python -m livekit_voice_user_interaction_agent.agent start
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
