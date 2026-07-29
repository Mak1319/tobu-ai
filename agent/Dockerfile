# syntax=docker/dockerfile:1.7
# LiveKit audio pipeline agent (Silero VAD + STT + TTS) — minimal runtime.
# Stage 1 builds the venv on a full toolchain image; Stage 2 keeps only the
# runtime libraries, so the final image drops build-essential and source.

# ---------- Stage 1: builder ----------
FROM python:3.13-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Cache uv's wheel cache + downloaded sources across builds. uv populates
# these directories itself, so a cache mount is enough — no separate rsync.
# The `id` makes the cache keyed per-project (uv.lock) instead of shared
# globally, which avoids stale wheels when two projects use different Python.
# --no-install-project skips the local package metadata so source edits
# don't bust the dep layer.
RUN --mount=type=cache,target=/root/.cache/uv,id=agent-uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev --no-install-project

# Copy source only after deps are installed/layered so source edits do
# not invalidate the wheel cache. Then install the project itself.
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv,id=agent-uv \
    uv sync --frozen --no-dev

# ---------- Stage 2: runtime ----------
FROM python:3.13-slim-bookworm AS runtime

# ffmpeg is the only runtime dep the audio pipeline actually needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Pull the prepared venv straight out of the builder.
COPY --from=builder /app/.venv /app/.venv

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

CMD ["python", "-m", "livekit.agent"]