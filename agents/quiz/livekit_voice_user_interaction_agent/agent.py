"""LiveKit Agents worker for the quiz voice session.

Temporary local voice stack: Faster-Whisper STT, Piper TTS, Silero VAD.
Registers as agent_name ``quiz`` (override with LIVEKIT_AGENT_NAME).
"""

from __future__ import annotations

import json
import logging
import os
import textwrap
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    TurnHandlingOptions,
    cli,
    room_io,
)
from livekit.agents import (
    stt as stt_module,
)
from livekit.plugins import openai, silero

from livekit_voice_user_interaction_agent.local_voice import (
    create_piper_tts,
    create_whisper_stt,
)

logger = logging.getLogger("quiz.livekit")

_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_ROOT / ".env")
load_dotenv(_ROOT.parents[1] / ".env.all")
load_dotenv(_ROOT.parents[1] / ".env")

AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "quiz").strip() or "quiz"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


def _parse_metadata(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


class QuizVoiceAssistant(Agent):
    def __init__(self, *, subject: str, topics: list[str], chat_id: str) -> None:
        topic_line = ", ".join(topics) if topics else "the selected topics"
        super().__init__(
            instructions=textwrap.dedent(
                f"""\
                You are a friendly voice quiz tutor running a study session.

                Session context:
                - chatId: {chat_id or "unknown"}
                - subject: {subject or "general study"}
                - topics: {topic_line}

                Rules:
                - Speak in plain text only. No markdown, lists, or emojis.
                - Keep replies to one or two short sentences.
                - Ask one question at a time about the subject/topics.
                - After the user answers, briefly acknowledge and ask the next question.
                - Stay on the selected subject and topics.
                """
            ),
        )


def prewarm(proc: JobProcess) -> None:
    # Only Silero here — Whisper download/load often exceeds the default
    # 10s process init timeout and kills the worker pool.
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("prewarmed Silero VAD")


server = AgentServer(
    setup_fnc=prewarm,
    initialize_process_timeout=120.0,
    num_idle_processes=1,
)


@server.rtc_session(agent_name=AGENT_NAME)
async def quiz_voice_agent(ctx: JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}

    meta = _parse_metadata(ctx.job.metadata)
    if not meta and ctx.room.metadata:
        meta = _parse_metadata(ctx.room.metadata)

    chat_id = str(meta.get("chatId") or "")
    if not chat_id and ctx.room.name.startswith("chat-"):
        chat_id = ctx.room.name[len("chat-") :]

    subject = str(meta.get("selectedSubject") or meta.get("subject") or "")
    topics_raw = meta.get("selectedTopics") or meta.get("topics") or []
    topics = [str(t) for t in topics_raw] if isinstance(topics_raw, list) else []

    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()
    whisper = ctx.proc.userdata.get("whisper_stt")
    if whisper is None:
        logger.info(
            "loading Faster-Whisper (%s / %s) — first load can take a while",
            os.getenv("WHISPER_MODEL", "distil-small.en"),
            os.getenv("WHISPER_DEVICE", "cpu"),
        )
        whisper = create_whisper_stt()
        ctx.proc.userdata["whisper_stt"] = whisper
    stt_engine = stt_module.StreamAdapter(stt=whisper, vad=vad)
    tts_engine = create_piper_tts()

    llm_engine = openai.LLM.with_ollama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
    )

    logger.info(
        "quiz voice session start room=%s chatId=%s subject=%s topics=%s",
        ctx.room.name,
        chat_id,
        subject,
        topics,
    )

    session = AgentSession(
        stt=stt_engine,
        llm=llm_engine,
        tts=tts_engine,
        vad=vad,
        turn_handling=TurnHandlingOptions(turn_detection="vad"),
        preemptive_generation=True,
    )

    await session.start(
        agent=QuizVoiceAssistant(subject=subject, topics=topics, chat_id=chat_id),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(),
        ),
    )

    await ctx.connect()

    greet = (
        f"Welcome to your study session on {subject or 'your topics'}. "
        "I'll ask you a few questions — answer in your own words."
    )
    await session.generate_reply(instructions=f"Greet the user with: {greet}")


if __name__ == "__main__":
    cli.run_app(server)
