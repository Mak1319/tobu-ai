"""LiveKit Agents worker entry point.

Run via ``python -m livekit.agent`` (the Dockerfile CMD). The worker:

1. Connects to the LiveKit server described by ``LIVEKIT_URL``.
2. Waits for the user to join a room (one room per chat wizard,
   ``chat-<chatId>``).
3. Spins up an ``AgentSession`` with Silero VAD + English turn detection
   + configurable STT/TTS.
4. Registers a single function tool -- :func:`run_quiz_graph` -- that
   wraps the existing LangGraph workflow. The agent's LLM calls the tool
   whenever the user actually says something; the tool returns the next
   prompt to speak (or the final summary).

The "thinking" layer is the same LangGraph graph the CLI runs, so any
future change to the workflow (new nodes, new prompts) automatically
applies to voice too.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from config.settings import get_settings
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    function_tool,
)
from livekit.plugins import openai as lk_openai
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

# ``EnglishModel`` would be a smaller alternative if we know the syllabus
# language is always English. Multilingual is the safe default for the
# demo.

from .langgraph_tool import run_quiz_graph

log = logging.getLogger("livekit-agent")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [livekit-agent] %(message)s",
)


def _build_stt(provider: str) -> Any:
    if provider == "openai":
        return lk_openai.STT()
    # Future: add deepgram/cartesia/etc. here as the plugin names are
    # configured via LIVEKIT_STT_PROVIDER.
    raise RuntimeError(
        f"Unsupported LIVEKIT_STT_PROVIDER={provider!r}. "
        "Only 'openai' is wired up in this build."
    )


def _build_tts(provider: str) -> Any:
    if provider == "openai":
        return lk_openai.TTS(voice="alloy")
    raise RuntimeError(
        f"Unsupported LIVEKIT_TTS_PROVIDER={provider!r}. "
        "Only 'openai' is wired up in this build."
    )


def _build_agent(*, room_name: str, user_id: str) -> Agent:
    """The LLM-facing agent persona. The function tool it exposes is the
    only route into the LangGraph workflow."""

    @function_tool
    async def ask_quiz(
        context: RunContext,
        # The agent's LLM will fill this in with whatever the user just
        # said. We deliberately don't validate -- voice transcripts are
        # messy and the workflow itself can reject garbage inputs.
        user_message: str,
    ) -> str:
        """Drive the syllabus quiz workflow.

        Call this once per user utterance. The response is what the user
        should hear next (either a question to answer, or the final
        summary). If the user has not said anything yet, call this with
        user_message=\"hello\" to kick the workflow forward.
        """
        log.info("ask_quiz invoked room=%s message=%r", room_name, user_message)
        return run_quiz_graph(
            room_name=room_name,
            user_id=user_id,
            user_message=user_message,
        )

    instructions = (
        "You are Tobu, a friendly voice tutor. You help the user study a "
        "syllabus they just uploaded. Call the `ask_quiz` tool exactly "
        "once for every user turn, including the first turn -- this is "
        "what drives the underlying quiz workflow. Speak the response "
        "naturally (no markdown, no JSON). Keep replies short -- two or "
        "three sentences at most. When the user has clearly finished the "
        "session, give a brief sign-off instead of another question."
    )

    return Agent(
        instructions=instructions,
        tools=[ask_quiz],
    )


async def entrypoint(ctx: JobContext) -> None:
    """LiveKit Agents job entrypoint. One invocation per room."""
    settings = get_settings()
    await ctx.connect()

    # The Next.js token route places the user id in the JWT identity and
    # the chat id in the room name (chat-<chatId>). Wait for the first
    # participant -- the worker may join before the user does.
    participant = await ctx.wait_for_participant()
    user_id = participant.identity
    chat_id = (ctx.room.name or "").removeprefix("chat-")
    log.info("room=%s chat_id=%s user_id=%s joined", ctx.room.name, chat_id, user_id)

    # We still need a real LLM to power the tool-calling agent. The
    # *content* of the LLM is the existing LangGraph workflow, but
    # LiveKit's agent framework needs a chat model to decide *when* to
    # call the tool. Pull the per-user provider from env (defaults to
    # OpenAI; the LangGraph workflow itself uses the user's saved
    # provider for the actual reasoning).
    chat_model = lk_openai.LLM(model="gpt-4o-mini")

    agent = _build_agent(room_name=ctx.room.name, user_id=user_id)

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=_build_stt(settings.livekit_stt_provider),
        llm=chat_model,
        tts=_build_tts(settings.livekit_tts_provider),
        turn_detection=MultilingualModel(),
    )

    await session.start(room=ctx.room, agent=agent)


server = AgentServer()


@server.rtc_session(agent_name="tobu-voice-agent")
async def _dispatch(ctx: JobContext) -> None:
    await entrypoint(ctx)


if __name__ == "__main__":
    # ``python -m livekit.agent`` => starts the worker.
    server.run()