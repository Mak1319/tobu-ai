#!/usr/bin/env bash
# Start imbbox2: Docker infra + topicable worker + quiz agents + tobu-ai-ui.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"

SYNC_DEPS=0
INFRA_ONLY=0
NO_VOICE=0
NO_UI=0
NO_QUIZ=0
NO_WORKER=0
SKIP_OLLAMA_CHECK=0

usage() {
  cat <<'EOF'
Usage: ./scripts/start.sh [options]

Starts local infrastructure and application processes for imbbox2.

Options:
  --sync              Run uv sync / npm install before starting
  --infra-only        Only start Docker Compose services
  --no-voice          Skip the LiveKit quiz voice worker
  --no-quiz           Skip the quiz FastAPI / Redis workers
  --no-worker         Skip the topicable document worker
  --no-ui             Skip the Next.js UI
  --skip-ollama-check Do not warn if Ollama is unavailable
  -h, --help          Show this help

Examples:
  ./scripts/start.sh
  ./scripts/start.sh --sync
  ./scripts/start.sh --infra-only
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sync) SYNC_DEPS=1 ;;
    --infra-only) INFRA_ONLY=1 ;;
    --no-voice) NO_VOICE=1 ;;
    --no-quiz) NO_QUIZ=1 ;;
    --no-worker) NO_WORKER=1 ;;
    --no-ui) NO_UI=1 ;;
    --skip-ollama-check) SKIP_OLLAMA_CHECK=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT"
mkdir -p "$LOG_DIR" "$PID_DIR"

log() { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

ensure_env_file() {
  local dest="$1"
  local src="$2"
  if [[ -f "$dest" ]]; then
    return 0
  fi
  if [[ -f "$src" ]]; then
    cp "$src" "$dest"
    log "created $dest from $(basename "$src")"
  else
    warn "missing $dest (and template $src)"
  fi
}

is_running() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ -n "${pid:-}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

start_bg() {
  local name="$1"
  local workdir="$2"
  local cmd="$3"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if is_running "$name"; then
    log "$name already running (pid $(cat "$pid_file"))"
    return 0
  fi

  log "starting $name"
  (
    cd "$workdir"
    # New session so stop.sh can kill the whole process group.
    setsid bash -lc "$cmd" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
  sleep 0.5
  if is_running "$name"; then
    log "$name started (pid $(cat "$pid_file"), log $log_file)"
  else
    warn "$name may have failed — check $log_file"
  fi
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$label is ready"
      return 0
    fi
    sleep 1
  done
  warn "$label not ready after ${attempts}s ($url)"
  return 1
}

wait_redis() {
  local attempts="${1:-30}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if docker compose -f "$ROOT/docker-compose.yaml" exec -T redis \
      redis-cli -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -qi PONG; then
      log "Redis is ready"
      return 0
    fi
    sleep 1
  done
  warn "Redis not ready after ${attempts}s"
  return 1
}

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
need_cmd docker
need_cmd curl
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"

if [[ "$INFRA_ONLY" -eq 0 ]]; then
  need_cmd uv
  need_cmd npm
  need_cmd node
fi

# ---------------------------------------------------------------------------
# Env files
# ---------------------------------------------------------------------------
ensure_env_file "$ROOT/.env" "$ROOT/.env.example"
ensure_env_file "$ROOT/.env.all" "$ROOT/.env.example"
ensure_env_file "$ROOT/tobu-ai-ui/.env.local" "$ROOT/tobu-ai-ui/.env.example"
ensure_env_file "$ROOT/workers/topicable/.env" "$ROOT/workers/topicable/.env.example"
ensure_env_file "$ROOT/agents/quiz/.env" "$ROOT/agents/quiz/.env.example"

if [[ ! -f "$ROOT/.env" ]]; then
  die "missing $ROOT/.env — copy .env.example and fill in secrets"
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

# ---------------------------------------------------------------------------
# Infrastructure
# ---------------------------------------------------------------------------
log "starting Docker Compose infrastructure"
docker compose -f "$ROOT/docker-compose.yaml" up -d \
  redis mongodb minio createbuckets livekit

log "waiting for Redis / MongoDB / MinIO / LiveKit"
wait_http "http://127.0.0.1:9000/minio/health/live" "MinIO" 60 || true
wait_http "http://127.0.0.1:7880/" "LiveKit" 60 || true
wait_redis 45 || true

if [[ "$INFRA_ONLY" -eq 1 ]]; then
  log "infra-only mode — done"
  cat <<EOF

Infrastructure is up.
  MinIO API:     http://localhost:9000
  MinIO console: http://localhost:9001
  MongoDB:       mongodb://localhost:27017
  Redis:         redis://localhost:6379
  LiveKit:       ws://localhost:7880

EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# Optional Ollama check
# ---------------------------------------------------------------------------
if [[ "$SKIP_OLLAMA_CHECK" -eq 0 ]]; then
  if command -v ollama >/dev/null 2>&1; then
    if ! curl -fsS "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      warn "Ollama CLI found but server not responding on :11434 — start it with: ollama serve"
    else
      log "Ollama is reachable"
    fi
  else
    warn "Ollama not found — topic graphs / quiz voice LLM calls will fail until it is installed and running"
  fi
fi

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
if [[ "$SYNC_DEPS" -eq 1 ]] || [[ ! -d "$ROOT/workers/topicable/.venv" ]]; then
  log "syncing topicable deps"
  (cd "$ROOT/workers/topicable" && uv sync)
fi
if [[ "$SYNC_DEPS" -eq 1 ]] || [[ ! -d "$ROOT/agents/quiz/.venv" ]]; then
  log "syncing quiz agent deps"
  (cd "$ROOT/agents/quiz" && uv sync)
fi
if [[ "$SYNC_DEPS" -eq 1 ]] || [[ ! -d "$ROOT/tobu-ai-ui/node_modules" ]]; then
  log "installing UI deps"
  (cd "$ROOT/tobu-ai-ui" && npm install)
fi

# ---------------------------------------------------------------------------
# Application processes
# ---------------------------------------------------------------------------
if [[ "$NO_WORKER" -eq 0 ]]; then
  start_bg topicable "$ROOT/workers/topicable" "uv run python main.py"
fi

if [[ "$NO_QUIZ" -eq 0 ]]; then
  start_bg quiz-api "$ROOT/agents/quiz" \
    "uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
fi

if [[ "$NO_VOICE" -eq 0 ]]; then
  start_bg quiz-voice "$ROOT/agents/quiz" \
    "uv run python -m livekit_voice_user_interaction_agent.agent dev"
fi

if [[ "$NO_UI" -eq 0 ]]; then
  start_bg ui "$ROOT/tobu-ai-ui" "npm run dev"
fi

cat <<EOF

imbbox2 is starting.

  UI:            http://localhost:3000
  Quiz API:      http://localhost:8000/health
  MinIO console: http://localhost:9001
  LiveKit:       ws://localhost:7880

Logs:  $LOG_DIR/
PIDs:  $PID_DIR/

Stop with:  ./scripts/stop.sh
EOF
