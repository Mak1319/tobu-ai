#!/usr/bin/env bash
# Stop and optionally remove the Docker Compose stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOVE_VOLUMES=0

usage() {
  cat <<'EOF'
Usage: ./scripts/docker-down.sh [options]

Options:
  -v, --volumes  Also remove named volumes (Mongo/Redis/MinIO/Ollama data)
  -h, --help     Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--volumes) REMOVE_VOLUMES=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "$REMOVE_VOLUMES" -eq 1 ]]; then
  docker compose down -v
else
  docker compose down
fi

echo "==> docker stack stopped"
