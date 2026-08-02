"""Temporary local STT/TTS backends: Faster-Whisper + Piper."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel
from livekit.agents import (
    LanguageCode,
    stt,
    tts,
    utils,
)
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    APIConnectOptions,
    NotGivenOr,
)
from livekit.agents.utils import is_given
from piper import PiperVoice
from piper.config import SynthesisConfig

_QUIZ_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_PIPER_MODEL = _QUIZ_ROOT / "models" / "en_US-lessac-medium.onnx"
# Fallback: reuse the onnx already checked into imb/ during local dev.
_FALLBACK_PIPER_MODEL = (
    Path(__file__).resolve().parents[3] / "imb" / "en_US-lessac-medium.onnx"
)


class PiperTTS(tts.TTS):
    def __init__(
        self,
        model_path: str,
        use_cuda: bool = False,
        *,
        speech_rate: float = 1.0,
    ):
        self._voice = PiperVoice.load(model_path, use_cuda=use_cuda)
        # Piper length_scale: higher = slower. Invert speech_rate so
        # 1.0 = normal, 1.2 = faster, 0.8 = slower.
        rate = speech_rate if speech_rate > 0 else 1.0
        self._syn_config = SynthesisConfig(length_scale=1.0 / rate)
        self._speech_rate = rate
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=self._voice.config.sample_rate,
            num_channels=1,
        )

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> PiperStream:
        return PiperStream(tts=self, input_text=text, conn_options=conn_options)


class PiperStream(tts.ChunkedStream):
    def __init__(
        self, *, tts: PiperTTS, input_text: str, conn_options: APIConnectOptions
    ):
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts: PiperTTS = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=self._tts._voice.config.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
        )

        loop = asyncio.get_running_loop()
        syn_config = self._tts._syn_config

        def _synthesize_chunks():
            return list(
                self._tts._voice.synthesize(self._input_text, syn_config=syn_config)
            )

        chunks = await loop.run_in_executor(None, _synthesize_chunks)
        for chunk in chunks:
            output_emitter.push(chunk.audio_int16_bytes)


class FasterWhisperSTT(stt.STT):
    def __init__(
        self,
        model_size: str = "distil-small.en",
        device: str = "cpu",
        compute_type: str = "int8",
    ):
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False)
        )
        self._model = WhisperModel(model_size, device=device, compute_type=compute_type)

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        loop = asyncio.get_running_loop()
        lang: str = language if is_given(language) else "en"

        merged = utils.merge_frames(buffer)
        audio_int16 = np.frombuffer(merged.data, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        segments, _info = await loop.run_in_executor(
            None,
            lambda: self._model.transcribe(audio_float32, language=lang, beam_size=5),
        )
        text = " ".join(seg.text for seg in segments).strip()

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language=LanguageCode(lang), text=text)],
        )


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def whisper_settings() -> tuple[str, str, str]:
    return (
        os.getenv("WHISPER_MODEL", "distil-small.en"),
        os.getenv("WHISPER_DEVICE", "cpu"),
        os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
    )


def resolve_piper_model_path() -> str:
    configured = os.getenv("PIPER_MODEL_PATH")
    if configured:
        return configured
    if _DEFAULT_PIPER_MODEL.is_file():
        return str(_DEFAULT_PIPER_MODEL)
    if _FALLBACK_PIPER_MODEL.is_file():
        return str(_FALLBACK_PIPER_MODEL)
    return str(_DEFAULT_PIPER_MODEL)


def piper_settings() -> tuple[str, bool, float]:
    model_path = resolve_piper_model_path()
    use_cuda = env_flag("PIPER_USE_CUDA", default=False)
    # Prefer PIPER_SPEECH_RATE (1.0=normal, >1 faster). PIPER_LENGTH_SCALE
    # overrides if set (Piper-native: higher = slower).
    length_raw = os.getenv("PIPER_LENGTH_SCALE")
    if length_raw is not None and length_raw.strip():
        try:
            length_scale = float(length_raw)
            speech_rate = (1.0 / length_scale) if length_scale > 0 else 1.0
        except ValueError:
            speech_rate = 1.0
    else:
        try:
            speech_rate = float(os.getenv("PIPER_SPEECH_RATE", "1.0"))
        except ValueError:
            speech_rate = 1.0
        if speech_rate <= 0:
            speech_rate = 1.0
    return model_path, use_cuda, speech_rate


def create_whisper_stt() -> FasterWhisperSTT:
    model_size, device, compute_type = whisper_settings()
    return FasterWhisperSTT(
        model_size=model_size,
        device=device,
        compute_type=compute_type,
    )


def create_piper_tts() -> PiperTTS:
    model_path, use_cuda, speech_rate = piper_settings()
    return PiperTTS(
        model_path=model_path,
        use_cuda=use_cuda,
        speech_rate=speech_rate,
    )
