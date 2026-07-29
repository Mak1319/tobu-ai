"""Aggregate scoring helpers over a session's round history."""

from __future__ import annotations

from schemas.answers import RoundResult


def total_score(history: list[RoundResult]) -> float:
    return sum(r.total_score for r in history)


def total_questions(history: list[RoundResult]) -> int:
    return sum(len(r.scores) for r in history)


def overall_average(history: list[RoundResult]) -> float:
    q = total_questions(history)
    return total_score(history) / q if q else 0.0


def per_topic_average(history: list[RoundResult]) -> dict[str, float]:
    buckets: dict[str, list[float]] = {}
    for round_result in history:
        buckets.setdefault(round_result.topic, []).extend(
            s.score for s in round_result.scores
        )
    return {
        topic: sum(scores) / len(scores) for topic, scores in buckets.items() if scores
    }
