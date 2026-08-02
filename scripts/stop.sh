#!/usr/bin/env bash
# Stop application processes started by scripts/start.sh.
# By default leaves Docker Compose infrastructure running.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_DIR="$RUN_DIR/pids"

STOP_INFRA=0

usage() {
  cat <<'EOF'
Usage: ./scripts/stop.sh [options]

Stops host processes started by ./scripts/start.sh.

Options:
  --infra     Also stop Docker Compose services (redis, mongo, minio, livekit)
  -h, --help  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --infra) STOP_INFRA=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

log() { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }

kill_named() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "${pid:-}" ]]; then
    rm -f "$pid_file"
    return 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    log "$name not running (stale pid $pid)"
    rm -f "$pid_file"
    return 0
  fi

  log "stopping $name (pid $pid)"
  # Kill the process group started with setsid in start.sh.
  kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  # Also signal direct children (uv/npm wrappers).
  pkill -P "$pid" 2>/dev/null || true
  for _ in $(seq 1 40); do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    warn "$name still alive — sending SIGKILL"
    kill -9 -- "-$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    pkill -9 -P "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

mkdir -p "$PID_DIR"

for name in ui quiz-voice quiz-api topicable; do
  kill_named "$name"
done

if [[ "$STOP_INFRA" -eq 1 ]]; then
  log "stopping Docker Compose infrastructure"
  docker compose -f "$ROOT/docker-compose.yaml" stop \
    livekit createbuckets minio mongodb redis || true
fi

log "done"
