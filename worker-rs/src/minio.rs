//! Thin S3-shaped wrapper around the AWS SDK.
//!
//! `aws-sdk-s3` doesn't expose MinIO's `listenBucketNotification` admin
//! endpoint, so that lives in `listener.rs` using `reqwest` directly.

use anyhow::{Context, Result};
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::Region,
    primitives::ByteStream,
    Client,
};
use std::collections::HashMap;

#[derive(Clone)]
pub struct S3Client {
    inner: Client,
    pub source_bucket: String,
    pub dest_bucket: String,
}

impl S3Client {
    pub async fn connect(
        endpoint: &str,
        region: &str,
        access_key: &str,
        secret_key: &str,
        source_bucket: &str,
        dest_bucket: &str,
    ) -> Result<Self> {
        let creds = Credentials::new(access_key, secret_key, None, None, "static");
        let shared = aws_config::defaults(BehaviorVersion::latest())
            .endpoint_url(endpoint)
            .region(Region::new(region.to_string()))
            .credentials_provider(creds)
            .load()
            .await;
        let s3_conf = aws_sdk_s3::config::Builder::from(&shared)
            .force_path_style(true)
            .build();
        let client = Client::from_conf(s3_conf);
        Ok(Self {
            inner: client,
            source_bucket: source_bucket.to_string(),
            dest_bucket: dest_bucket.to_string(),
        })
    }

    pub fn client(&self) -> &Client {
        &self.inner
    }

    pub async fn ensure_buckets(&self) -> Result<()> {
        for bucket in [&self.source_bucket, &self.dest_bucket] {
            match self.inner.head_bucket().bucket(bucket).send().await {
                Ok(_) => {}
                Err(sdk_err) => {
                    let not_found = sdk_err
                        .as_service_error()
                        .map(|e| e.is_not_found())
                        .unwrap_or(false);
                    if not_found {
                        self.inner
                            .create_bucket()
                            .bucket(bucket)
                            .send()
                            .await
                            .with_context(|| format!("create_bucket({bucket}) failed"))?;
                        tracing::info!(bucket = %bucket, "created bucket");
                    } else {
                        return Err(anyhow::Error::new(sdk_err)
                            .context(format!("head_bucket({bucket}) failed")));
                    }
                }
            }
        }
        Ok(())
    }

    pub async fn get_object_bytes(&self, bucket: &str, key: &str) -> Result<Vec<u8>> {
        let out = self
            .inner
            .get_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("get_object({bucket}/{key}) failed"))?;
        let bytes = out
            .body
            .collect()
            .await
            .with_context(|| format!("get_object({bucket}/{key}) body read failed"))?;
        Ok(bytes.to_vec())
    }

    /// List objects in `bucket` whose user metadata `content-hash` matches
    /// `hash`.
    pub async fn find_by_hash(&self, bucket: &str, hash: &str) -> Result<Option<String>> {
        let mut paginator = self
            .inner
            .list_objects_v2()
            .bucket(bucket)
            .into_paginator()
            .send();
        while let Some(page) = paginator.next().await {
            let page = page.context("list_objects_v2 page failed")?;
            for obj in page.contents() {
                let Some(key) = obj.key() else { continue };
                let head = self
                    .inner
                    .head_object()
                    .bucket(bucket)
                    .key(key)
                    .send()
                    .await;
                let Ok(head) = head else { continue };
                let md = head.metadata().cloned().unwrap_or_default();
                if md.get("content-hash").map(|s| s.as_str()) == Some(hash) {
                    return Ok(Some(key.to_string()));
                }
            }
        }
        Ok(None)
    }

    /// Upload a `.md` blob into the dest bucket with user metadata.
    pub async fn put_markdown(
        &self,
        bucket: &str,
        key: &str,
        bytes: Vec<u8>,
        content_hash: &str,
        source_key: &str,
        source_content_type: &str,
        flagged: bool,
    ) -> Result<()> {
        let mut md: HashMap<String, String> = HashMap::new();
        md.insert("content-hash".to_string(), content_hash.to_string());
        md.insert("source-key".to_string(), source_key.to_string());
        md.insert(
            "source-content-type".to_string(),
            source_content_type.to_string(),
        );
        if flagged {
            md.insert("flagged".to_string(), "true".to_string());
        }

        let body = ByteStream::from(bytes);
        let mut req = self
            .inner
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(body)
            .content_type("text/markdown");
        for (k, v) in md {
            req = req.metadata(k, v);
        }

        req.send()
            .await
            .with_context(|| format!("put_object({bucket}/{key}) failed"))?;
        Ok(())
    }

    /// Mirror the Python `processed_key` layout: `<chatId>/<sha256>.md`.
    pub fn processed_key(chat_id: &str, content_hash: &str) -> String {
        format!("{chat_id}/{content_hash}.md")
    }
}
