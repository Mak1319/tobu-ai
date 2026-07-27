//! Document parsing.
//!
//! Wraps `docling::DocumentConverter` for the PDF/image → Markdown work.
//!
//! The hidden-text safeguard is **not yet wired in** — we still need to
//! pick the right pdfium API surface for per-character fill color.
//! Until then, `hidden_text_pages_flagged` is a stub that returns 0.

use std::path::Path;

use anyhow::{Context, Result};

/// Run Docling on the given bytes and return Markdown.
pub fn convert_bytes(bytes: &[u8], filename: &str) -> Result<String> {
    use docling::{DocumentConverter, SourceDocument};

    // Persist to a temp file so Docling's filesystem-based loaders can
    // sniff the magic bytes.
    let tmp = tempfile::Builder::new()
        .prefix("docling-input-")
        .suffix(&sanitize_suffix(filename))
        .tempfile()
        .context("failed to allocate temp file for Docling")?;
    std::fs::write(tmp.path(), bytes).context("failed to write temp file for Docling")?;

    let converter = DocumentConverter::new();
    let source = SourceDocument::from_file(tmp.path().to_str().unwrap())
        .map_err(|e| anyhow::anyhow!("SourceDocument::from_file failed: {e:?}"))?;
    let result = converter
        .convert(source)
        .map_err(|e| anyhow::anyhow!("DocumentConverter::convert failed: {e:?}"))?;
    let md = result.document.export_to_markdown().to_string();
    Ok(md)
}

fn sanitize_suffix(filename: &str) -> String {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let clean_ext: String = ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    format!(".{clean_ext}")
}

/// Stub. Returns 0 until the safeguard lands.
pub fn hidden_text_pages_flagged(_bytes: &[u8]) -> usize {
    0
}