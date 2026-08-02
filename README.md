# imbbox2

Local study / quiz stack: Next.js UI, document→topic worker, quiz LangGraph agents, and Docker infra (Redis, MongoDB, MinIO, LiveKit).

For component roles and Redis/Mongo naming, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Prerequisites

| Tool | Notes |
|------|--------|
| [Docker](https://docs.docker.com/get-docker/) + Compose plugin | Infra: Redis, MongoDB, MinIO, LiveKit |
| [uv](https://docs.astral.sh/uv/) | Python workers / quiz agents (3.13+) |
| Node.js 20+ + npm | `tobu-ai-ui` |
| [Ollama](https://ollama.com/) | LLM for topic graphs and quiz voice (recommended) |
| `curl` | Health checks in the start script |

## One-time setup

```bash
# 1. Clone and enter the repo
cd imbbox2

# 2. Create env files from templates (start.sh also does this if missing)
cp .env.example .env
cp .env.example .env.all
cp tobu-ai-ui/.env.example tobu-ai-ui/.env.local
cp workers/topicable/.env.example workers/topicable/.env
cp agents/quiz/.env.example agents/quiz/.env

# 3. Edit secrets so Compose and host apps agree (especially passwords,
#    AUTH_SECRET, and LiveKit key/secret). Keep host endpoints on localhost.
```

Pull an Ollama model that matches your env (`LLM_MODEL` / `OLLAMA_MODEL`):

```bash
ollama serve   # if not already running
ollama pull qwen2.5:0.5b
# quiz voice .env.example defaults to llama3.2 — pull that too, or change OLLAMA_MODEL
```

## Start everything

```bash
chmod +x scripts/start.sh scripts/stop.sh   # once
./scripts/start.sh
```

First run (or after dependency changes):

```bash
./scripts/start.sh --sync
```

What `start.sh` launches:

1. **Docker Compose** — `redis`, `mongodb`, `minio`, `createbuckets`, `livekit`
2. **topicable** — document worker (`workers/topicable`)
3. **quiz API** — FastAPI + Redis QG/AA workers on `:8000` (`agents/quiz`)
4. **quiz voice** — LiveKit agent worker (`agents/quiz` … `agent dev`)
5. **tobu-ai-ui** — Next.js on `:3000`

Then open **http://localhost:3000**.

### Useful URLs

| Service | URL |
|---------|-----|
| App UI | http://localhost:3000 |
| Quiz health | http://localhost:8000/health |
| MinIO API | http://localhost:9000 |
| MinIO console | http://localhost:9001 |
| LiveKit | ws://localhost:7880 |
| Ollama | http://localhost:11434 |

### Logs and PIDs

Host process logs and PID files live under `.run/` (gitignored):

```bash
tail -f .run/logs/ui.log
tail -f .run/logs/topicable.log
tail -f .run/logs/quiz-api.log
tail -f .run/logs/quiz-voice.log
```

### Start options

```bash
./scripts/start.sh --infra-only      # Docker only
./scripts/start.sh --no-voice        # skip LiveKit voice worker
./scripts/start.sh --no-quiz         # skip quiz FastAPI
./scripts/start.sh --no-worker       # skip topicable
./scripts/start.sh --no-ui           # skip Next.js
./scripts/start.sh --skip-ollama-check
./scripts/start.sh --help
```

## Stop

```bash
# Stop UI / workers / agents; leave Docker infra up
./scripts/stop.sh

# Also stop Redis, MongoDB, MinIO, LiveKit
./scripts/stop.sh --infra
```

## Manual start (optional)

If you prefer separate terminals:

```bash
# Infra
docker compose up -d redis mongodb minio createbuckets livekit

# Worker
cd workers/topicable && uv sync && uv run python main.py

# Quiz API (also starts Redis QG/AA background threads)
cd agents/quiz && uv sync && uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Quiz LiveKit voice worker
cd agents/quiz && uv run python -m livekit_voice_user_interaction_agent.agent dev

# UI
cd tobu-ai-ui && npm install && npm run dev
```

## Notes

- Align passwords and LiveKit `devkey`/`secret` across root `.env`, `tobu-ai-ui/.env.local`, and service `.env` files.
- Host processes talk to infra on **localhost**; containers on the Compose network use service names (`redis`, `minio`, `livekit`).
- `workers/initdata-extraction-worker` is a legacy Docling path and is **not** started by default (topicable owns the document pipeline).
- `agents/topic` is out of scope for this start path.
- Deeper architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md).
