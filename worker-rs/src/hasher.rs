//! Streaming SHA-256 over a `Bytes`-like buffer.
//!
//! `docling-rs` and the S3 client both hand us the source bytes as a
//! single in-memory `Vec<u8>` or `Bytes`; we still use the streaming API
//! because (a) it scales to large PDFs without an extra copy and (b) it
//! makes the hashing step composable if we ever swap to a streaming fetch.

use sha2::{Digest, Sha256};

/// Compute the SHA-256 hex digest of `bytes`. Returns `(hex, len)`.
pub fn hash_bytes(bytes: &[u8]) -> (String, usize) {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    (hex::encode(digest), bytes.len())
}