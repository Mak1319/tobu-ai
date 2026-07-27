//! Environment-driven configuration.
//!
//! All knobs are read from environment variables at startup. We fail fast
//! on missing required values so the container restarts instead of silently
//! no-op'ing.

use std::time::Duration;

use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Settings {
    pub minio_endpoint: String,
    pub minio_access_key: String,
    pub minio_secret_key: String,
    pub source_bucket: String,
    pub dest_bucket: String,
    pub mongo_uri: String,
    pub mongo_db: String,
    pub mongo_collection: String,
    pub poll_interval: Duration,
    pub stuck_processing_after: Duration,
    pub log_level: String,
}

impl Settings {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            minio_endpoint: required("MINIO_ENDPOINT")?,
            minio_access_key: std::env::var("AWS_ACCESS_KEY_ID")
                .or_else(|_| std::env::var("MINIO_ROOT_USER"))
                .context("AWS_ACCESS_KEY_ID (or MINIO_ROOT_USER) must be set")?,
            minio_secret_key: std::env::var("AWS_SECRET_ACCESS_KEY")
                .or_else(|_| std::env::var("MINIO_ROOT_PASSWORD"))
                .context("AWS_SECRET_ACCESS_KEY (or MINIO_ROOT_PASSWORD) must be set")?,
            source_bucket: required("MINIO_SOURCE_BUCKET")?,
            dest_bucket: required("MINIO_DEST_BUCKET")?,
            mongo_uri: required("MONGO_URI")?,
            mongo_db: required("MONGO_DB")?,
            mongo_collection: std::env::var("MONGO_COLLECTION")
                .unwrap_or_else(|_| "uploadedfiles".to_string()),
            poll_interval: Duration::from_secs(
                std::env::var("WORKER_POLL_INTERVAL_SEC")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(5),
            ),
            stuck_processing_after: Duration::from_secs(
                60 * std::env::var("WORKER_STUCK_PROCESSING_MIN")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10),
            ),
            log_level: std::env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
        })
    }
}

fn required(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("{key} must be set"))
}
