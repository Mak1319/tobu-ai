# syntax=docker/dockerfile:1.7
# Celery + docling document worker. docling pulls a few native libs at
# runtime (libgl for PDF rendering, libxml/libxslt for parsers), so the
# runtime image keeps those but drops the C toolchain — wheels are built
# in Stage 1 and copied into Stage 2.

# ---------- Stage 1: builder ----------
FROM python:3.13-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install deps first with cache mounts. --no-install-project keeps the
# local package out of this layer so source edits don't bust the cache.
RUN --mount=type=cache,target=/root/.cache/uv,id=worker-uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev --no-install-project

# Copy source after deps so source edits don't bust the dep layer, then
# install the project itself.
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv,id=worker-uv \
    uv sync --frozen --no-dev

# ---------- Stage 2: runtime ----------
FROM python:3.13-slim-bookworm AS runtime

# Runtime libs docling needs (PDF/image rendering, XML parsing).
# No build-essential, no compilers — that's what made the image big.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libxml2 \
        libxslt1.1 \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv /app/.venv

WORKDIR /app

# docling's model downloads are big — pre-download is left to runtime,
# but we point the cache at /data so a persistent volume can survive restarts.
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/data/.cache/huggingface \
    TORCH_HOME=/data/.cache/torch \
    PATH="/app/.venv/bin:$PATH"

CMD ["python", "main.py"]