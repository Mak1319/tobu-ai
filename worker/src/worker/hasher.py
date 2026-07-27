"""Streaming SHA-256 over a binary file-like object.

The next.js upload caps files at 10 MB, so reading into memory is fine in
practice — but streaming avoids ever holding both the file *and* a hashed
copy if Docling needs to materialise the file on disk anyway.
"""

from __future__ import annotations

import hashlib


def hash_stream(stream) -> tuple[str, bytes]:
    """Consume `stream`, return (hex_sha256, raw_bytes).

    `stream` is consumed in 1 MiB chunks until EOF. Returns the full
    payload alongside the digest so callers can hand the bytes to a
    tempfile or directly to Docling without re-reading the object.
    """

    hasher = hashlib.sha256()
    chunks: list[bytes] = []
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        hasher.update(chunk)
        chunks.append(chunk)
    return hasher.hexdigest(), b"".join(chunks)
