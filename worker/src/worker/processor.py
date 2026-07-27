"""Docling-backed PDF/image → markdown conversion.

We import Docling lazily because:
  * The import alone takes ~3 s and pulls model runtimes.
  * We want the worker to be able to start, subscribe to events, and
    answer health probes even before Docling finishes loading on a
    cold cache.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

log = logging.getLogger(__name__)


def convert_bytes_to_markdown(payload: bytes, *, source_filename: str) -> str:
    """Convert the bytes of a PDF/image to markdown using Docling.

    Writes `payload` to a tempfile in the platform's temp dir, points
    Docling at it, then exports the markdown and returns the string.

    Raises `RuntimeError` if conversion fails for any reason so the
    pipeline can flip the row to `failed` with the message.
    """

    from docling.document_converter import DocumentConverter

    # `DocumentConverter` is the recommended entry point per
    # https://docling-project.github.io/docling/ — used because
    # instantiating it once and reusing it is the documented pattern
    # and we don't want to reload models per file.
    converter = DocumentConverter()

    suffix = Path(source_filename).suffix.lower() or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as fh:
        fh.write(payload)
        tmp_path = Path(fh.name)

    try:
        result = converter.convert(str(tmp_path))
        if result is None:
            raise RuntimeError("Docling returned no result")
        return result.document.export_to_markdown()
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            log.warning(
                "tmp file could not be removed", path=str(tmp_path), exc_info=True
            )
