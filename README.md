# imbbox2

Study / quiz stack: Next.js UI, document→topic worker, quiz LangGraph agents, Redis, MongoDB, MinIO, LiveKit, and Ollama.

For component roles and Redis/Mongo naming, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Quick start (Docker — runs anywhere)

Requires only **Docker** + Compose plugin.

```bash
cp .env.example .env
# Edit .env: set strong passwords, AUTH_SECRET, and LiveKit key/secret if needed.

chmod +x scripts/docker-up.sh scripts/docker-down.sh
./scripts/docker-up.sh
```

Open **http://localhost:3000**.

This builds and starts:

| Image / service | Role |
|-----------------|------|
| `imbbox2-ui` (`ui`) | Next.js app |
| `imbbox2-topicable` (`topicable`) | Document + topic-graph worker |
| `imbbox2-quiz` (`quiz-api`, `quiz-voice`) | Quiz FastAPI + LiveKit voice worker |
| `redis`, `mongodb`, `minio`, `livekit` | Infra |
| `ollama` (+ `ollama-init`) | Local LLM (auto-pulls `LLM_MODEL`) |

```bash
docker compose ps
docker compose logs -f ui topicable quiz-api quiz-voice
./scripts/docker-down.sh          # stop
./scripts/docker-down.sh -v       # stop + wipe volumes
```

Rebuild after code changes:

```bash
./scripts/docker-up.sh --no-cache
# or
docker compose build ui topicable quiz-api && docker compose up -d
```

### Useful URLs

| Service | URL |
|---------|-----|
| App UI | http://localhost:3000 |
| Quiz health | http://localhost:8000/health |
| MinIO API | http://localhost:9000 |
| MinIO console | http://localhost:9001 |
| LiveKit | ws://localhost:7880 |
| Ollama | http://localhost:11434 |

### Images

| Image | Dockerfile |
|-------|------------|
| `imbbox2-ui:latest` | [`tobu-ai-ui/Dockerfile`](tobu-ai-ui/Dockerfile) |
| `imbbox2-topicable:latest` | [`workers/topicable/Dockerfile`](workers/topicable/Dockerfile) |
| `imbbox2-quiz:latest` | [`agents/quiz/Dockerfile`](agents/quiz/Dockerfile) |

Browser-facing LiveKit URL is baked at **UI image build** time via `NEXT_PUBLIC_LIVEKIT_URL` (default `ws://localhost:7880`). Override before build if clients are not on the same machine:

```bash
NEXT_PUBLIC_LIVEKIT_URL=ws://YOUR_HOST_IP:7880 \
NEXT_PUBLIC_APP_URL=http://YOUR_HOST_IP:3000 \
LIVEKIT_NODE_IP=YOUR_HOST_IP \
./scripts/docker-up.sh --no-cache
```

---

## Local hybrid (optional)

Host runs UI/workers; Docker runs infra only.

### Prerequisites

| Tool | Notes |
|------|--------|
| Docker + Compose | Infra |
| [uv](https://docs.astral.sh/uv/) | Python 3.13+ |
| Node.js 20+ + npm | UI |
| Ollama | Or use Compose `ollama` |
| `curl` | Health checks |

### Setup

```bash
cp .env.example .env
cp .env.example .env.all
cp tobu-ai-ui/.env.example tobu-ai-ui/.env.local
cp workers/topicable/.env.example workers/topicable/.env
cp agents/quiz/.env.example agents/quiz/.env
# Align passwords / LiveKit keys; keep host endpoints on localhost.
```

```bash
chmod +x scripts/start.sh scripts/stop.sh
./scripts/start.sh          # or: ./scripts/start.sh --sync
./scripts/stop.sh
./scripts/stop.sh --infra
```

Logs/PIDs: `.run/logs/`, `.run/pids/`.

---

## Notes

- Compose app services talk over the Docker network (`redis`, `minio`, `mongodb`, `livekit`, `ollama`).
- Host hybrid mode uses `localhost` for the same ports.
- URL-encode special characters in Mongo passwords inside `MONGODB_URI`.
- `workers/initdata-extraction-worker` is legacy and not started by default.
- `agents/topic` is out of scope for these start paths.
