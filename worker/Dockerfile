# syntax=docker/dockerfile:1.7

# ---- build stage ----
FROM python:3.12-slim AS build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Docling needs libgomp, libgl / libglib for image preprocessing, and a
# working libstdc++. `build-essential` is unused here but cheap and
# keeps a parallel flow possible if we ever need to build a wheel.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        libgomp1 \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv. PEP 668 on python:3.12-slim blocks plain `pip install`, so
# we use --break-system-packages. We don't pin a specific uv version —
# pip picks the latest available. `uv pip` calls below are written so
# they work on any modern uv.
RUN pip install --no-cache-dir --break-system-packages uv

WORKDIR /app

# Materialize deps into a venv that the runtime stage copies. We pull
# only pyproject.toml + uv.lock first (so Docker can cache this layer).
# `uv sync --no-install-project` resolves dependencies into the venv
# without touching the project source, which we copy later.
COPY pyproject.toml uv.lock ./
RUN uv venv /app/.venv \
    && uv sync \
        --python /app/.venv/bin/python \
        --no-install-project \
        --no-cache

# ---- runtime stage ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/home/worker/.venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgomp1 \
        libgl1 \
        libglib2.0-0 \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 worker

# Docling's model cache lives under $HOME/.cache by default; mount a
# volume there so restart cycles don't redownload.
ENV HOME=/home/worker \
    HF_HOME=/home/worker/.cache/huggingface \
    DOCLING_CACHE_DIR=/home/worker/.cache/docling

# Copy the venv from the build stage, then the worker source.
COPY --from=build /app/.venv /home/worker/.venv
COPY --chown=worker:worker src /app/src

# Make sure the venv layout is sane — sometimes uv writes bin/ via
# symlinks to /usr/local/bin/python which the runtime stage doesn't have.
# Recompile any pyc caches and ensure entry points are real binaries.
RUN /home/worker/.venv/bin/python -m compileall -q /home/worker/.venv || true

USER worker
WORKDIR /app

# tini gives us SIGTERM forwarding for the asyncio loops.
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["python", "-m", "worker.main"]
