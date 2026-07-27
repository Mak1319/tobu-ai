//! Streaming SHA-256 sanity check.

use worker_rs::hasher::hash_bytes;

#[test]
fn empty_input() {
    let (h, n) = hash_bytes(b"");
    assert_eq!(
        h,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert_eq!(n, 0);
}

#[test]
fn abc() {
    let (h, n) = hash_bytes(b"abc");
    assert_eq!(
        h,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_eq!(n, 3);
}

#[test]
fn longer_run() {
    let (h, _n) = hash_bytes(b"The quick brown fox jumps over the lazy dog");
    assert_eq!(
        h,
        "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
    );
}