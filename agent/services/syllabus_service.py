"""Resolves a syllabus into plain text, regardless of whether the caller
already has the text or only has a MinIO object key (e.g. the docling-worker
processed markdown produced from an uploaded PDF).
"""

from __future__ import annotations

from schemas.syllabus import SyllabusInput
from storage.minio.downloader import download_text


def load_syllabus(
    *, text: str | None = None, object_key: str | None = None
) -> SyllabusInput:
    if text is not None:
        return SyllabusInput(text=text, source_key=object_key)
    if object_key is not None:
        return SyllabusInput(text=download_text(object_key), source_key=object_key)
    raise ValueError("Either `text` or `object_key` must be provided.")
