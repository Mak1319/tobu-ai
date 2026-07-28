FROM python:3.13-slim

# System deps docling needs at runtime (libxml/libxsml for parsers, libgl for
# OpenCV/PDF rendering, and a build toolchain for any wheel fallbacks).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
        libxml2 \
        libxslt1.1 \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Install uv so we can use the existing uv.lock for reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install deps in a separate layer so source edits don't bust the cache.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy the rest of the worker source.
COPY . .

# docling's model downloads are big — pre-download is left to runtime.
# Default command is the Celery worker; compose overrides for the bridge.
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/data/.cache/huggingface \
    TORCH_HOME=/data/.cache/torch \
    PATH="/app/.venv/bin:$PATH"

CMD ["uv", "run", "celery", "-A", "tasks", "worker", "--loglevel=INFO", "--queue=docling"]
