//! Worker entrypoint.
//!
//! Wires:
//!   * `config`        — env loading
//!   * `minio`         — S3-shaped client (download / upload / dedup lookup)
//!   * `mongo`         — `uploadedfiles` access
//!   * `parser`        — Docling + hidden-text safeguard
//!   * `listener`      — MinIO bucket-event subscription with reconnect
//!   * `reconciler`    — startup + reconnect sweep
//!   * `pipeline`      — per-row orchestration
//!
//! Two long-running tasks run concurrently: the listener (live events)
//! and the reconciler (every `WORKER_POLL_INTERVAL_SEC`). Both call into
//! the same `Pipeline::run` so the dedup / hash / Docling logic is
//! shared.

use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::sync::watch;

use worker_rs::{config, listener, minio, mongo, pipeline, reconciler};

use crate::{minio::S3Client, pipeline::Pipeline};

#[tokio::main]
async fn main() -> Result<()> {
    let s = config::Settings::from_env().context("config load failed")?;
    init_tracing(&s.log_level);
    tracing::info!(?s, "worker starting");

    let s3 = S3Client::connect(
        &s.minio_endpoint,
        "us-east-1",
        &s.minio_access_key,
        &s.minio_secret_key,
        &s.source_bucket,
        &s.dest_bucket,
    )
    .await
    .context("S3 client init failed")?;
    s3.ensure_buckets().await.context("ensure_buckets failed")?;

    let coll = mongo::connect(&s.mongo_uri, &s.mongo_db, &s.mongo_collection)
        .await
        .context("mongo connect failed")?;

    let pipeline = Pipeline {
        s3: Arc::new(s3),
        coll,
    };

    let (stop_tx, stop_rx) = watch::channel(false);

    // Initial reconciler sweep so we don't depend on the listener firing
    // for events that happened while we were down.
    let initial = reconciler::run_once(&pipeline.coll, s.stuck_processing_after, |row| {
        let p = pipeline.clone();
        async move { p.run(row).await }
    })
    .await;
    tracing::info!(initial_handled = initial, "startup reconciler complete");

    // SIGTERM / SIGINT → stop the world cleanly.
    tokio::spawn({
        let stop_tx = stop_tx.clone();
        async move {
            wait_for_signal().await;
            tracing::info!("shutdown signal received");
            let _ = stop_tx.send(true);
        }
    });

    // Listener task.
    let listener_pipeline = pipeline.clone();
    let listener_access = s.minio_access_key.clone();
    let listener_secret = s.minio_secret_key.clone();
    let listener_endpoint = s.minio_endpoint.clone();
    let listener_bucket = s.source_bucket.clone();
    let listener_stop = stop_rx.clone();
    let listener_handle = tokio::spawn(async move {
        listener::run(
            &listener_endpoint,
            &listener_bucket,
            &listener_access,
            &listener_secret,
            vec![
                "s3:ObjectCreated:Put".to_string(),
                "s3:ObjectCreated:CompleteMultipartUpload".to_string(),
            ],
            move |bucket: String, key: String| {
                let p = listener_pipeline.clone();
                async move {
                    let coll = p.coll.clone();
                    let row = match mongo::find_by_key(&coll, &key).await {
                        Ok(Some(r)) => r,
                        Ok(None) => {
                            tracing::warn!(bucket = %bucket, key = %key, "event for unknown key; skipping");
                            return;
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, bucket = %bucket, key = %key, "find_by_key failed; skipping");
                            return;
                        }
                    };
                    if row.bucket != bucket {
                        tracing::warn!(expected = %row.bucket, got = %bucket, key = %key, "event bucket mismatch; skipping");
                        return;
                    }
                    p.run(row).await;
                }
            },
            listener_stop,
        )
        .await
    });

    // Reconciler loop.
    let reconciler_handle = {
        let p = pipeline.clone();
        let mut stop_rx = stop_rx.clone();
        let interval = s.poll_interval;
        let stuck_after = s.stuck_processing_after;
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(interval);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() { break; }
                    }
                    _ = tick.tick() => {
                        let handled = reconciler::run_once(&p.coll, stuck_after, |row| {
                            let p = p.clone();
                            async move { p.run(row).await }
                        }).await;
                        if handled > 0 {
                            tracing::info!(handled, "reconciler handled rows");
                        }
                    }
                }
            }
        })
    };

    // Wait for stop, then join.
    let mut stop_rx = stop_rx;
    let _ = stop_rx.changed().await;
    tracing::info!("stopping tasks");
    let _ = listener_handle.await;
    reconciler_handle.abort();
    tracing::info!("worker stopped");
    Ok(())
}

fn init_tracing(level: &str) {
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(format!("{level},worker_rs=debug")));
    let _ = fmt()
        .with_env_filter(filter)
        .with_target(true)
        .try_init();
}

async fn wait_for_signal() {
    use tokio::signal;
    let ctrl_c = async {
        let _ = signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        let mut s = signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to register SIGTERM handler");
        s.recv().await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
}