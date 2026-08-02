#!/usr/bin/env bash
# Build and run the full imbbox2 stack in Docker (portable).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PULL_ONLY=0
DETACH=1
NO_CACHE=0

usage() {
  cat <<'EOF'
Usage: ./scripts/docker-up.sh [options]

Build application images and start the full Compose stack
(infra + Ollama + UI + topicable + quiz API + quiz voice).

Options:
  --foreground   Attach to compose logs (default: detached)
  --no-cache     Rebuild images without cache
  --pull         docker compose pull base images first
  -h, --help     Show this help

Examples:
  ./scripts/docker-up.sh
  ./scripts/docker-up.sh --no-cache
  ./scripts/docker-up.sh --foreground
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --foreground) DETACH=0 ;;
    --no-cache) NO_CACHE=1 ;;
    --pull) PULL_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ! -f "$ROOT/.env" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    echo "==> created .env from .env.example — edit secrets before production use"
  else
    echo "error: missing .env (and .env.example)" >&2
    exit 1
  fi
fi

# Ensure AUTH_SECRET exists for the UI container
if ! grep -qE '^AUTH_SECRET=.+' "$ROOT/.env"; then
  SECRET="$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)"
  echo "AUTH_SECRET=$SECRET" >>"$ROOT/.env"
  echo "==> appended AUTH_SECRET to .env"
fi

if [[ "$PULL_ONLY" -eq 1 ]]; then
  docker compose pull
fi

BUILD_ARGS=(build)
if [[ "$NO_CACHE" -eq 1 ]]; then
  BUILD_ARGS+=(--no-cache)
fi
BUILD_ARGS+=(ui topicable quiz-api)

echo "==> building application images"
docker compose "${BUILD_ARGS[@]}"

echo "==> starting stack"
if [[ "$DETACH" -eq 1 ]]; then
  docker compose up -d
  cat <<EOF

Stack is up (detached).

  UI:            http://localhost:3000
  Quiz API:      http://localhost:8000/health
  MinIO console: http://localhost:9001
  LiveKit:       ws://localhost:7880
  Ollama:        http://localhost:11434

Status:  docker compose ps
Logs:    docker compose logs -f ui topicable quiz-api quiz-voice
Stop:    ./scripts/docker-down.sh
EOF
else
  docker compose up
fi
