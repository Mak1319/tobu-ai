"""Tests for the streaming hasher."""

from __future__ import annotations

import hashlib
import io

from worker.hasher import hash_stream


def test_hash_stream_matches_hashlib_for_empty_input() -> None:
    digest, data = hash_stream(io.BytesIO(b""))
    assert data == b""
    assert digest == hashlib.sha256(b"").hexdigest()


def test_hash_stream_matches_hashlib_for_payload() -> None:
    payload = b"hello imbbox2" * 10_000  # ~130 KB, exercises >1 chunk
    digest, data = hash_stream(io.BytesIO(payload))
    assert data == payload
    assert digest == hashlib.sha256(payload).hexdigest()


def test_hash_stream_returns_consistent_digest() -> None:
    """Re-reading the same content yields the same hex digest."""
    payload = b"deterministic-payload"
    digest_a, _ = hash_stream(io.BytesIO(payload))
    digest_b, _ = hash_stream(io.BytesIO(payload))
    assert digest_a == digest_b
