FROM python:3.12-slim

# LiveKit Agents runs an audio pipeline (Silero VAD + STT + TTS) and prefers
# `ffmpeg` on PATH for any downstream resampling. libgl/libpq mirror the
# docling-worker's image so the same base can be reused if we ever consolidate.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install uv so the existing uv.lock drives reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install deps in a separate layer so source edits don't bust the cache.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy the rest of the agent source (graph, providers, nodes, livekit worker, ...).
COPY . .

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

CMD ["uv", "run", "python", "-m", "livekit.agent"]