# imbbox2 Agent

A LangGraph backend that turns a syllabus into an adaptive, human-in-the-loop
quiz. The LLM provider is chosen at **runtime**, per user, and every run is
resumable across human input via a MongoDB-backed checkpointer.

## Workflow

```
extract_subjects --(no subjects)--> END
       |
       v
select_subject (HITL if >1 subject)
       |
       v
extract_topics -> extend_topics -> generate_topic_graph -> select_topic (HITL)
       |
       v
generate_questions -> ask_answers (HITL, per question) -> analyze_answers
       |
       v
ask_continue (HITL) --(no)--> finalize -> END
       |
      (yes)
       v
generate_progressive_questions --> ask_answers (loop)
```

| #   | Layer                                 | Node(s)                                                       |
| --- | ------------------------------------- | ------------------------------------------------------------- |
| 1   | Subject extraction                    | `nodes/subject/extraction.py`                                 |
| 2   | Subject selection (human-in-the-loop) | `nodes/subject/selection.py`                                  |
| 3   | Topic extraction                      | `nodes/topic/extraction.py`                                   |
| 4/5 | Topic extension + relationship graph  | `nodes/topic/extension.py`, `nodes/topic/graph_generation.py` |
| 6   | Topic selection (human-in-the-loop)   | `nodes/topic/selection.py`                                    |
| 7   | Question generation                   | `nodes/question/generation.py`                                |
| 8   | Answer asking (human-in-the-loop)     | `nodes/question/asking.py`                                    |
| 9   | Answer analysis / scoring             | `nodes/assessment/answer_analysis.py`                         |
| 10  | Progressive question making           | `nodes/assessment/progressive_questions.py`                   |

## Architecture

- **Provider-agnostic LLMs** (`providers/`) -- nodes never import a vendor
  SDK directly. `providers/factory.py` resolves a user's saved preference
  from MongoDB (`persistence/mongodb/preferences.py`) at call time and hands
  back a LangChain `BaseChatModel` via the matching adapter in
  `providers/adapters/`. Falls back to `config/settings.py` defaults when a
  user has no saved preference.
- **MongoDB** (`persistence/mongodb/`) -- backs both the LangGraph
  checkpointer (`checkpoint.py`, required for `interrupt()`/resume to work)
  and per-user model preferences (`preferences.py`).
- **MinIO** (`storage/minio/`) -- downloads syllabus source files (or their
  docling-processed markdown) uploaded via `tobu-ai-ui`.
- **Human-in-the-loop** -- implemented with LangGraph's `interrupt()` in
  `nodes/subject/selection.py`, `nodes/topic/selection.py`,
  `nodes/question/asking.py`, and `nodes/human_loop/interrupts.py`. Resuming
  a paused run is done by invoking the compiled graph again with
  `Command(resume=<value>)` against the same `thread_id` (see
  `nodes/human_loop/resume.py` and `main.py`).
- **AG-UI** (`api/agui.py`) -- intentionally a thin, unwired stub for now.
  The project brief called for integrating with `tobu-ai-ui` eventually, but
  scope for this pass stayed inside `agent/`. See the `TODO(agui-integration)`
  marker in that file.

## Setup

```sh
cd agent
cp .env.example .env   # then fill in real values
uv sync
```

## Running locally

```sh
# Kick off a new run
uv run python -m main start --syllabus-file path/to/syllabus.txt --user-id u123

# When it pauses on an interrupt, resume it with the human's answer
uv run python -m main resume --thread-id <thread_id_from_above> --value "Mathematics"
```

## Setting a user's model provider

Nothing in this repo writes to the `model_preferences` MongoDB collection
yet (that's expected to come from the `tobu-ai-ui` "Model" wizard step).
For local testing, insert a document directly:

```js
db.model_preferences.insertOne({
    user_id: "u123",
    provider: "openai", // "openai" | "anthropic" | "google" | "ollama"
    model: "gpt-4o-mini",
    api_key: "sk-...",
    temperature: 0.3,
});
```

Or use `agent/services/model_preferences.py` from a Python shell:

```python
from services.model_preferences import set_preferences
from providers.models import ProviderConfig, ProviderName

set_preferences("u123", ProviderConfig(provider=ProviderName.OPENAI, model="gpt-4o-mini", api_key="sk-..."))
```

## Voice (LiveKit)

The agent can also be driven over a LiveKit audio room. The voice worker
lives in `agent/livekit/` and reuses the same LangGraph workflow --
voice just changes the transport (microphone/speaker instead of text in
the terminal).

### Layout

- `agent/livekit/agent.py` — entry point. Run via `python -m livekit.agent`.
- `agent/livekit/langgraph_tool.py` — the bridge between a LiveKit user
  utterance and the existing LangGraph workflow, including the
  `interrupt()` round-trip.
- `persistence/mongodb/livekit_sessions.py` — per-room bookkeeping so a
  rejoin picks the same LangGraph thread.

### Bring it up

```sh
# Start the base stack (minio, mongo, redis, document-worker)
docker compose up -d

# Then start the voice stack — opt-in profile, no impact when omitted.
docker compose --profile voice up -d livekit livekit-agent

# Tail logs to verify the worker registers with the LiveKit server.
docker compose logs -f livekit-agent
```

You also need to start `tobu-ai-ui` and pass the matching
`NEXT_PUBLIC_LIVEKIT_URL` so the browser knows where to dial. The dev
defaults (`ws://localhost:7880`) work as long as the browser is on the
same host.

### How the voice flow works

1. The Next.js token route (`/api/livekit/token`) mints a JWT for
   `room=chat-{chatId}` with `identity={userId}`.
2. The browser opens the LiveKit room via `components/voice-room.tsx`
   (audio-only).
3. `livekit-agent` joins the room, waits for the user, then spins up
   an `AgentSession` (Silero VAD + multilingual turn detection +
   OpenAI STT/TTS).
4. Each user utterance triggers the `ask_quiz` function tool, which
   delegates to `run_quiz_graph` -- the same `build_graph()` entry point
   the CLI uses. `interrupt()` payloads from `select_subject`,
   `select_topic`, `answer_question`, and `continue_session` nodes are
   converted into spoken prompts; the next user utterance resumes the
   paused graph via `Command(resume=...)`.
5. The thread is persisted in MongoDB via the
   `livekit_sessions` collection, so refreshing the page (or
   restarting the worker) keeps the same conversation.

### Configuring STT/TTS/LLM providers

The voice worker reads provider names from
`LIVEKIT_STT_PROVIDER`, `LIVEKIT_TTS_PROVIDER`, and
`LIVEKIT_LLM_PROVIDER`. Only `openai` is wired up by default;
additional plugins (deepgram, cartesia, etc.) plug in via
`agent/livekit/agent.py::_build_stt` / `_build_tts`. The LLM
configuration only governs which LiveKit plugin decides *when* to
call the `ask_quiz` tool -- the actual reasoning happens inside the
existing LangGraph workflow, which uses the user's saved provider
from `model_preferences`.
