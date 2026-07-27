//! MinIO bucket-event listener with reconnect-on-error.
//!
//! MinIO's bucket notifications are best-effort — events can be missed
//! across container restarts, network blips, or short outages. We open
//! a long-lived HTTP stream to the admin endpoint
//!   `{endpoint}/bucket/{bucket}?events=...`
//! and parse newline-delimited JSON records as they arrive. The
//! `aws-sdk-s3` has no equivalent, so this lives outside that client.
//!
//! The wrapper exposes `run(handler, stop)` where:
//!  * `handler` is an async callable that takes `(bucket, key)` and does
//!    the work.
//!  * `stop` is an `async_channel`-style signal that the caller sets to
//!    ask us to tear down cleanly.

use std::time::Duration;

use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use tokio::sync::watch;

#[derive(Debug, Deserialize)]
struct Record {
    #[serde(default)]
    s3: Option<S3Inner>,
}

#[derive(Debug, Deserialize)]
struct S3Inner {
    #[serde(default)]
    bucket: Option<BucketInner>,
    #[serde(default)]
    object: Option<ObjectInner>,
}

#[derive(Debug, Deserialize)]
struct BucketInner {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ObjectInner {
    #[serde(default)]
    key: Option<String>,
}

pub trait EventHandler: Send + Sync + 'static {
    fn handle(&self, bucket: String, key: String) -> futures_util::future::BoxFuture<'static, ()>;
}

impl<F, Fut> EventHandler for F
where
    F: Fn(String, String) -> Fut + Send + Sync + 'static,
    Fut: futures_util::future::Future<Output = ()> + Send + 'static,
{
    fn handle(&self, bucket: String, key: String) -> futures_util::future::BoxFuture<'static, ()> {
        Box::pin(self(bucket, key))
    }
}

/// Build a `reqwest::Client` preset for the long-lived listen stream.
pub fn build_client() -> Result<Client> {
    Ok(Client::builder()
        .tcp_nodelay(true)
        .no_proxy()
        .build()?)
}

/// Reader half: drain the response body line by line.
/// We return the JSON record when one comes in, and `None` when the
/// stream ends cleanly so the caller can decide to reconnect.
async fn next_record(body: &mut reqwest::Response) -> Result<Option<Record>> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let bytes = body.chunk().await?;
    if bytes.is_none() {
        return Ok(None);
    }
    // We don't keep state across chunks — the easiest correct thing is
    // to read the whole body as bytes and walk newlines. MinIO sends
    // records immediately so the buffer rarely exceeds a few KiB.
    let chunk = bytes.unwrap_or_default();
    let mut buf = chunk.to_vec();
    while let Some(next) = body.chunk().await? {
        buf.extend_from_slice(&next);
    }
    let mut reader = BufReader::new(buf.as_slice());
    let mut line = String::new();
    while reader.read_line(&mut line).await? > 0 {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            line.clear();
            continue;
        }
        match serde_json::from_str::<Record>(trimmed) {
            Ok(rec) => return Ok(Some(rec)),
            Err(e) => {
                tracing::warn!(error = %e, raw = trimmed, "skipped non-JSON line");
                line.clear();
                continue;
            }
        }
    }
    Ok(None)
}

/// Run one listen session. Returns when the stream ends or yields an
/// error so the outer `run` loop can decide what to do.
async fn consume_one_session(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
    events: &[String],
    client: &Client,
    handler: &dyn EventHandler,
    mut stop: watch::Receiver<bool>,
) -> Result<()> {
    let url = format!(
        "{}/bucket/{bucket}?events={}",
        endpoint.trim_end_matches('/'),
        events.join("&events=")
    );
    let resp = client
        .get(&url)
        .basic_auth(access_key, Some(secret_key))
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("listen stream opened with status {status}: {body}");
    }
    tracing::info!(bucket = %bucket, endpoint = %endpoint, "subscribed to bucket events");

    let mut resp = resp;
    loop {
        tokio::select! {
            biased;
            _ = stop.changed() => {
                if *stop.borrow() { return Ok(()); }
            }
            rec = next_record(&mut resp) => {
                let rec = rec?;
                let Some(rec) = rec else { anyhow::bail!("listen stream ended cleanly") };
                let Some(s3) = rec.s3 else { continue };
                let Some(bucket_name) = s3.bucket.and_then(|b| b.name) else { continue };
                let Some(obj) = s3.object else { continue };
                let Some(key) = obj.key else { continue };
                handler.handle(bucket_name, key).await;
            }
        }
    }
}

/// Outer reconnect loop with capped exponential backoff.
pub async fn run(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
    events: Vec<String>,
    handler: impl EventHandler,
    stop: watch::Receiver<bool>,
) {
    let client = match build_client() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "failed to build reqwest client; listener cannot start");
            return;
        }
    };
    let mut delay = Duration::from_secs(5);
    let max_delay = Duration::from_secs(60);
    let mut stop = stop;
    while !*stop.borrow() {
        match consume_one_session(
            endpoint,
            bucket,
            access_key,
            secret_key,
            &events,
            &client,
            &handler,
            stop.clone(),
        )
        .await
        {
            Ok(()) => {
                // Clean exit usually means stop was set.
                if *stop.borrow() {
                    return;
                }
                tracing::warn!(delay_secs = delay.as_secs(), "listen stream ended; reconnecting");
            }
            Err(e) => {
                tracing::error!(error = %e, delay_secs = delay.as_secs(), "listen error; reconnecting");
            }
        }
        // Sleep with cancellation on stop.
        tokio::select! {
            _ = stop.changed() => {
                if *stop.borrow() { return; }
            }
            _ = tokio::time::sleep(delay) => {}
        }
        delay = std::cmp::min(delay * 2, max_delay);
    }
}
