"""Document -> markdown conversion (text path or Docling for images)."""

from __future__ import annotations

import io
import logging
import mimetypes
import tempfile
import time
from pathlib import Path

from docling.document_converter import DocumentConverter

log = logging.getLogger("topicable.document")

IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".webp",
    ".heic",
}
IMAGE_MIMES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/webp",
    "image/heic",
}

_converter: DocumentConverter | None = None


def _get_converter() -> DocumentConverter:
    global _converter
    if _converter is None:
        log.info("initializing Docling DocumentConverter (first use)")
        t0 = time.perf_counter()
        _converter = DocumentConverter()
        log.info("Docling ready in %.3fs", time.perf_counter() - t0)
    return _converter


def is_image_file(filename: str, content_type: str | None = None) -> bool:
    suffix = Path(filename).suffix.lower()
    if suffix in IMAGE_EXTENSIONS:
        log.debug("is_image_file=True reason=extension suffix=%s", suffix)
        return True
    if content_type and content_type.split(";")[0].strip().lower() in IMAGE_MIMES:
        log.debug("is_image_file=True reason=content_type=%s", content_type)
        return True
    guessed, _ = mimetypes.guess_type(filename)
    hit = bool(guessed and guessed in IMAGE_MIMES)
    log.debug("is_image_file=%s guessed_mime=%s filename=%s", hit, guessed, filename)
    return hit


def document_has_images(source: bytes, filename: str) -> bool:
    """True if the file is an image, or a PDF/Office doc that embeds images."""
    if is_image_file(filename):
        return True

    suffix = Path(filename).suffix.lower()
    log.debug("scanning for embedded images suffix=%s size=%d", suffix, len(source))
    if suffix == ".pdf":
        has = _pdf_has_images(source)
        log.debug("pdf_has_images=%s", has)
        return has
    if suffix in {".docx"}:
        has = _docx_has_images(source)
        log.debug("docx_has_images=%s", has)
        return has
    log.debug("no image scan for suffix=%s → False", suffix)
    return False


def _pdf_has_images(source: bytes) -> bool:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(source))
        log.debug("pdf pages=%d", len(reader.pages))
        for i, page in enumerate(reader.pages):
            resources = page.get("/Resources")
            if resources is None:
                continue
            resources = resources.get_object() if hasattr(resources, "get_object") else resources
            xobject = resources.get("/XObject") if resources else None
            if xobject is None:
                continue
            xobject = xobject.get_object() if hasattr(xobject, "get_object") else xobject
            for name in xobject:
                obj = xobject[name]
                obj = obj.get_object() if hasattr(obj, "get_object") else obj
                if obj.get("/Subtype") == "/Image":
                    log.debug("found PDF image on page=%d name=%s", i, name)
                    return True
    except Exception as exc:
        log.warning("pdf image scan failed, treating as possible image doc: %s", exc)
        return True
    return False


def _docx_has_images(source: bytes) -> bool:
    try:
        from zipfile import ZipFile

        with ZipFile(io.BytesIO(source)) as zf:
            media = [name for name in zf.namelist() if name.startswith("word/media/")]
            log.debug("docx media entries=%d sample=%s", len(media), media[:5])
            return bool(media)
    except Exception as exc:
        log.warning("docx image scan failed: %s", exc)
        return True


def convert_with_docling(source: bytes, filename: str) -> str:
    suffix = Path(filename).suffix or ".bin"
    log.info("docling convert start filename=%s suffix=%s bytes=%d", filename, suffix, len(source))
    t0 = time.perf_counter()
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(source)
        tmp.flush()
        log.debug("docling temp file=%s", tmp.name)
        result = _get_converter().convert(tmp.name)
        markdown = result.document.export_to_markdown()
    log.info(
        "docling convert done chars=%d elapsed=%.3fs",
        len(markdown),
        time.perf_counter() - t0,
    )
    return markdown


def extract_text_markdown(source: bytes, filename: str) -> str:
    """Build a markdown document from plain text / PDF text / DOCX text."""
    suffix = Path(filename).suffix.lower()
    title = Path(filename).stem
    log.debug("text extract start filename=%s suffix=%s", filename, suffix)
    t0 = time.perf_counter()

    if suffix == ".pdf":
        text = _extract_pdf_text(source)
    elif suffix == ".docx":
        text = _extract_docx_text(source)
    elif suffix in {".txt", ".md", ".markdown", ".csv", ".json", ".xml", ".html", ".htm"}:
        text = source.decode("utf-8", errors="replace")
        log.debug("decoded text-like file as utf-8 chars=%d", len(text))
    else:
        try:
            text = source.decode("utf-8")
            log.debug("decoded unknown suffix as utf-8 chars=%d", len(text))
        except UnicodeDecodeError:
            log.info("binary non-image file %s -> falling back to docling", filename)
            return convert_with_docling(source, filename)

    text = text.strip()
    if not text:
        log.warning("extracted empty text from %s", filename)
        return f"# {title}\n\n_(empty document)_\n"

    if suffix in {".md", ".markdown"}:
        markdown = text if text.startswith("#") else f"# {title}\n\n{text}\n"
    else:
        markdown = f"# {title}\n\n{text}\n"

    log.info(
        "text extract done chars=%d elapsed=%.3fs",
        len(markdown),
        time.perf_counter() - t0,
    )
    return markdown


def _extract_pdf_text(source: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(source))
    parts: list[str] = []
    for i, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        log.debug("pdf page=%d text_chars=%d", i, len(page_text))
        parts.append(page_text)
    return "\n\n".join(p.strip() for p in parts if p and p.strip())


def _extract_docx_text(source: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(source))
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    log.debug("docx paragraphs_with_text=%d", len(paras))
    return "\n\n".join(paras)


def to_markdown(
    source: bytes,
    filename: str,
    content_type: str | None = None,
    *,
    force_docling: bool = False,
) -> tuple[str, str]:
    """
    Convert source bytes to markdown.

    Returns (markdown, method) where method is 'docling' or 'text'.
    When force_docling is True, always uses Docling (for testing).
    """
    log.debug(
        "to_markdown filename=%s content_type=%s bytes=%d force_docling=%s",
        filename,
        content_type,
        len(source),
        force_docling,
    )
    if force_docling:
        log.info(
            "route decision filename=%s force_docling=True → docling",
            filename,
        )
        return convert_with_docling(source, filename), "docling"

    image_file = is_image_file(filename, content_type)
    has_images = document_has_images(source, filename)
    needs_docling = has_images or image_file
    log.info(
        "route decision filename=%s image_file=%s has_images=%s → %s",
        filename,
        image_file,
        has_images,
        "docling" if needs_docling else "text",
    )
    if needs_docling:
        return convert_with_docling(source, filename), "docling"
    return extract_text_markdown(source, filename), "text"
