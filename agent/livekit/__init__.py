"""LiveKit voice-agent worker.

This package exposes a single entry point -- :func:`run_worker` in
`agent.py` -- that connects a LiveKit Agents `AgentSession` to the existing
LangGraph workflow. The voice transport (VAD, turn detection, STT, TTS) is
handled by the LiveKit framework; the *thinking* layer is just the same
LangGraph graph the CLI runs, surfaced through
:func:`agent.livekit.langgraph_tool.run_quiz_graph`.
"""