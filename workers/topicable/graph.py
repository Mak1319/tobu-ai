"""LangGraph pipeline: subjects → granular topics → weighted relation graph."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph

from config import Settings

log = logging.getLogger("topicable.graph")

SUBJECT_PROMPT = """Extract educational subjects and their subtopics from the syllabus/document.
Return ONLY valid JSON:
{
  "subjects": [
    {
      "name": "Subject Name",
      "id": "snake_case_id",
      "subtopics": [
        {"name": "Subtopic", "id": "snake_case_id"}
      ]
    }
  ]
}
No markdown fences, no commentary.
"""

EXPAND_PROMPT = """Given these subjects/subtopics, expand each subtopic into granular leaf topics.
Return ONLY valid JSON with the same subjects, each subtopic gaining a "granular" array:
{
  "subjects": [
    {
      "name": "...",
      "id": "...",
      "subtopics": [
        {
          "name": "...",
          "id": "...",
          "granular": [{"name": "Fine topic", "id": "snake_case_id"}]
        }
      ]
    }
  ]
}
Keep existing ids. No markdown fences.
"""

RELATE_PROMPT = """Given this topic hierarchy, create weighted relation edges between topic ids.
Return ONLY valid JSON:
{
  "edges": [
    {"from": "topic_id", "to": "topic_id", "weight": 0}
  ]
}
Rules:
- weight is integer 0-100 for relatedness
- omit edges with weight < 20
- use only ids that appear in the hierarchy
- no self-edges
- no markdown fences
"""


class TopicGraphState(TypedDict, total=False):
    markdown: str
    subjects: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    topic_graph: dict[str, Any] | None
    error: str | None
    status: str


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json_object(text: str) -> dict[str, Any]:
    parsed = json.loads(_strip_fences(text))
    if not isinstance(parsed, dict):
        raise TypeError("model returned non-object JSON")
    return parsed


def _collect_ids(subjects: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for subject in subjects:
        sid = subject.get("id")
        if sid:
            ids.add(str(sid))
        for sub in subject.get("subtopics") or []:
            sub_id = sub.get("id")
            if sub_id:
                ids.add(str(sub_id))
            for gran in sub.get("granular") or []:
                gid = gran.get("id")
                if gid:
                    ids.add(str(gid))
    return ids


def _build_nodes(subjects: list[dict[str, Any]]) -> list[dict[str, str]]:
    nodes: list[dict[str, str]] = []
    for subject in subjects:
        subject_id = str(subject.get("id") or "")
        subject_name = str(subject.get("name") or subject_id)
        if subject_id:
            nodes.append(
                {
                    "id": subject_id,
                    "label": subject_name,
                    "kind": "subject",
                    "subject": subject_id,
                }
            )
        for sub in subject.get("subtopics") or []:
            sub_id = str(sub.get("id") or "")
            if sub_id:
                nodes.append(
                    {
                        "id": sub_id,
                        "label": str(sub.get("name") or sub_id),
                        "kind": "subtopic",
                        "subject": subject_id,
                    }
                )
            for gran in sub.get("granular") or []:
                gid = str(gran.get("id") or "")
                if gid:
                    nodes.append(
                        {
                            "id": gid,
                            "label": str(gran.get("name") or gid),
                            "kind": "granular",
                            "subject": subject_id,
                        }
                    )
    return nodes


def _filter_edges(
    raw_edges: list[Any],
    valid_ids: set[str],
) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    dropped = {"bad_type": 0, "missing": 0, "unknown_id": 0, "self": 0, "low_weight": 0}
    for edge in raw_edges:
        if not isinstance(edge, dict):
            dropped["bad_type"] += 1
            continue
        src = edge.get("from") or edge.get("source")
        dst = edge.get("to") or edge.get("target")
        try:
            weight = int(edge.get("weight", 0))
        except (TypeError, ValueError):
            dropped["bad_type"] += 1
            continue
        if src is None or dst is None:
            dropped["missing"] += 1
            continue
        src, dst = str(src), str(dst)
        if src not in valid_ids or dst not in valid_ids:
            dropped["unknown_id"] += 1
            continue
        if src == dst:
            dropped["self"] += 1
            continue
        if weight < 20:
            dropped["low_weight"] += 1
            continue
        edges.append({"from": src, "to": dst, "weight": max(0, min(100, weight))})
    log.debug(
        "edge filter kept=%d dropped=%s raw=%d", len(edges), dropped, len(raw_edges)
    )
    return edges


def _attach_adjacency(
    nodes: list[dict[str, str]],
    edges: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    adj: dict[str, list[dict[str, Any]]] = {node["id"]: [] for node in nodes}
    for edge in edges:
        adj.setdefault(edge["from"], []).append(
            {"to": edge["to"], "weight": edge["weight"]}
        )
        adj.setdefault(edge["to"], []).append(
            {"to": edge["from"], "weight": edge["weight"]}
        )
    return adj


def _normalize_llm_root(base_url: str) -> str:
    root = base_url.rstrip("/")
    root = root.removesuffix("/v1")
    return root.rstrip("/") or base_url.rstrip("/")


def _http_error_detail(response: httpx.Response) -> str:
    body = (response.text or "").strip()
    try:
        data = response.json()
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict) and err.get("message"):
                return str(err["message"])
            if isinstance(err, str):
                return err
            if data.get("message"):
                return str(data["message"])
    except Exception:  # noqa: BLE001, S110
        pass
    return body[:500] if body else response.reason_phrase


def _truncate(markdown: str, limit: int = 24000) -> str:
    if len(markdown) <= limit:
        return markdown
    log.warning("markdown truncated for LLM %d/%d chars", limit, len(markdown))
    return markdown[:limit] + "\n\n[truncated]"


class _LLMClient:
    """Thin OpenAI-compatible client with Ollama /api/chat fallback."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = _normalize_llm_root(settings.llm_base_url)
        self.openai_url = f"{self.root}/v1/chat/completions"
        self.ollama_url = f"{self.root}/api/chat"
        self.client = httpx.Client(
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            timeout=settings.llm_timeout,
        )

    def chat_json(self, system: str, user: str) -> dict[str, Any]:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        try:
            text = self._openai(messages)
        except httpx.HTTPStatusError as exc:
            detail = _http_error_detail(exc.response)
            model_missing = (
                exc.response.status_code == 404
                and "model" in detail.lower()
                and "not found" in detail.lower()
            )
            if model_missing:
                raise RuntimeError(
                    f"LLM model not found: {detail}. "
                    f"Set LLM_MODEL to an installed tag (got {self.settings.llm_model!r})"
                ) from exc
            if exc.response.status_code in {404, 405}:
                log.warning(
                    "OpenAI endpoint failed (%s) — falling back to Ollama /api/chat: %s",
                    exc.response.status_code,
                    detail,
                )
                text = self._ollama(messages)
            else:
                raise RuntimeError(
                    f"LLM HTTP {exc.response.status_code}: {detail} "
                    f"(model={self.settings.llm_model!r})"
                ) from exc
        log.debug(
            "LLM raw chars=%d preview=%s", len(text), text[:240].replace("\n", " ")
        )
        return _parse_json_object(text)

    def _openai(self, messages: list[dict[str, str]]) -> str:
        log.info("LLM (openai) model=%s", self.settings.llm_model)
        response = self.client.post(
            self.openai_url,
            json={
                "model": self.settings.llm_model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": messages,
            },
        )
        if response.is_error:
            raise httpx.HTTPStatusError(
                f"{response.status_code} {_http_error_detail(response)}",
                request=response.request,
                response=response,
            )
        return response.json()["choices"][0]["message"]["content"]

    def _ollama(self, messages: list[dict[str, str]]) -> str:
        log.info("LLM (ollama) model=%s", self.settings.llm_model)
        response = self.client.post(
            self.ollama_url,
            json={
                "model": self.settings.llm_model,
                "messages": messages,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2},
            },
        )
        if response.is_error:
            raise RuntimeError(
                f"LLM HTTP {response.status_code}: {_http_error_detail(response)}"
            )
        return response.json()["message"]["content"]

    def warn_if_model_missing(self) -> None:
        try:
            response = self.client.get(f"{self.root}/api/tags")
            if response.status_code != 200:
                return
            names = {
                str(m.get("name") or m.get("model") or "")
                for m in (response.json().get("models") or [])
            }
            names.discard("")
            if self.settings.llm_model not in names:
                log.warning(
                    "LLM_MODEL=%r not found in Ollama. available=%s",
                    self.settings.llm_model,
                    sorted(names),
                )
            else:
                log.info("LLM model ready: %s", self.settings.llm_model)
        except Exception as exc:  # noqa: BLE001
            log.debug("could not list Ollama models: %s", exc)

    def close(self) -> None:
        self.client.close()


def _build_langgraph(llm: _LLMClient):
    """Compile: extract_subjects → expand_topics → relate_topics → assemble."""

    def extract_subjects(state: TopicGraphState) -> dict[str, Any]:
        log.info("langgraph node=extract_subjects")
        t0 = time.perf_counter()
        try:
            markdown = _truncate(state.get("markdown") or "")
            raw = llm.chat_json(
                SUBJECT_PROMPT,
                f"Document:\n\n{markdown}",
            )
            subjects = raw.get("subjects") or []
            if not isinstance(subjects, list) or not subjects:
                raise ValueError("no subjects extracted")
            log.info(
                "extract_subjects ok count=%d elapsed=%.3fs",
                len(subjects),
                time.perf_counter() - t0,
            )
            return {"subjects": subjects, "status": "subjects_extracted", "error": None}
        except Exception as exc:  # noqa: BLE001
            log.warning("extract_subjects failed: %s", exc)
            return {
                "subjects": [],
                "status": "failed",
                "error": f"extract_subjects: {exc}",
            }

    def expand_topics(state: TopicGraphState) -> dict[str, Any]:
        if state.get("error") or not state.get("subjects"):
            log.debug("expand_topics skipped")
            return {}
        log.info("langgraph node=expand_topics")
        t0 = time.perf_counter()
        try:
            raw = llm.chat_json(
                EXPAND_PROMPT,
                json.dumps({"subjects": state["subjects"]}, ensure_ascii=False),  # pyright: ignore[reportTypedDictNotRequiredAccess]
            )
            subjects = raw.get("subjects") or state["subjects"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
            if not isinstance(subjects, list) or not subjects:
                raise ValueError("expand returned no subjects")
            log.info(
                "expand_topics ok subjects=%d elapsed=%.3fs",
                len(subjects),
                time.perf_counter() - t0,
            )
            return {"subjects": subjects, "status": "topics_expanded"}
        except Exception as exc:  # noqa: BLE001
            # Soft-fail: keep unexpanded subjects and continue to edges.
            log.warning("expand_topics failed, continuing with base subjects: %s", exc)
            return {"status": "expand_partial"}

    def relate_topics(state: TopicGraphState) -> dict[str, Any]:
        if state.get("error") or not state.get("subjects"):
            log.debug("relate_topics skipped")
            return {"edges": []}
        log.info("langgraph node=relate_topics")
        t0 = time.perf_counter()
        try:
            raw = llm.chat_json(
                RELATE_PROMPT,
                json.dumps({"subjects": state["subjects"]}, ensure_ascii=False),  # pyright: ignore[reportTypedDictNotRequiredAccess]
            )
            edges = raw.get("edges") or []
            if not isinstance(edges, list):
                edges = []
            log.info(
                "relate_topics ok raw_edges=%d elapsed=%.3fs",
                len(edges),
                time.perf_counter() - t0,
            )
            return {"edges": edges, "status": "edges_built"}
        except Exception as exc:  # noqa: BLE001
            log.warning("relate_topics failed, continuing with empty edges: %s", exc)
            return {"edges": [], "status": "relate_partial"}

    def assemble(state: TopicGraphState) -> dict[str, Any]:
        log.info("langgraph node=assemble")
        if state.get("error") or not state.get("subjects"):
            return {"topic_graph": None, "status": "failed"}
        subjects = state["subjects"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        valid_ids = _collect_ids(subjects)
        if not valid_ids:
            return {
                "topic_graph": None,
                "status": "failed",
                "error": "no topic ids after extraction",
            }
        nodes = _build_nodes(subjects)
        edges = _filter_edges(state.get("edges") or [], valid_ids)
        topic_graph = {
            "subjects": subjects,
            "nodes": nodes,
            "edges": edges,
            "graph": _attach_adjacency(nodes, edges),
        }
        log.info(
            "assemble ok subjects=%d nodes=%d edges=%d",
            len(subjects),
            len(nodes),
            len(edges),
        )
        return {"topic_graph": topic_graph, "status": "done", "error": None}

    def after_extract(state: TopicGraphState) -> str:
        if state.get("error") or not state.get("subjects"):
            return "assemble"
        return "expand_topics"

    builder = StateGraph(TopicGraphState)
    builder.add_node("extract_subjects", extract_subjects)
    builder.add_node("expand_topics", expand_topics)
    builder.add_node("relate_topics", relate_topics)
    builder.add_node("assemble", assemble)

    builder.add_edge(START, "extract_subjects")
    builder.add_conditional_edges(
        "extract_subjects",
        after_extract,
        {"expand_topics": "expand_topics", "assemble": "assemble"},
    )
    builder.add_edge("expand_topics", "relate_topics")
    builder.add_edge("relate_topics", "assemble")
    builder.add_edge("assemble", END)

    graph = builder.compile()
    log.info(
        "langgraph compiled: extract_subjects → expand_topics → relate_topics → assemble"
    )
    return graph


class TopicGraphBuilder:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.llm = _LLMClient(settings)
        self.llm.warn_if_model_missing()
        self.graph = _build_langgraph(self.llm)

    def build(self, markdown: str) -> dict[str, Any] | None:
        """Run the LangGraph topic pipeline. Returns None on hard failure."""
        log.info("topic graph (langgraph) start markdown_chars=%d", len(markdown))
        t0 = time.perf_counter()
        try:
            result: TopicGraphState = self.graph.invoke(  # pyright: ignore[reportAssignmentType]
                {
                    "markdown": markdown,
                    "subjects": [],
                    "edges": [],
                    "topic_graph": None,
                    "error": None,
                    "status": "started",
                }
            )
            topic_graph = result.get("topic_graph")
            status = result.get("status")
            error = result.get("error")
            if topic_graph is None:
                log.warning(
                    "topic graph failed status=%s error=%s elapsed=%.3fs",
                    status,
                    error,
                    time.perf_counter() - t0,
                )
                return None
            log.info(
                "topic graph ok status=%s subjects=%d nodes=%d edges=%d elapsed=%.3fs",
                status,
                len(topic_graph.get("subjects") or []),
                len(topic_graph.get("nodes") or []),
                len(topic_graph.get("edges") or []),
                time.perf_counter() - t0,
            )
            return topic_graph
        except Exception as exc:
            log.warning(
                "topic graph generation failed after %.3fs: %s",
                time.perf_counter() - t0,
                exc,
            )
            log.debug("topic graph failure detail", exc_info=True)
            return None

    def close(self) -> None:
        log.debug("closing LLM client")
        self.llm.close()
