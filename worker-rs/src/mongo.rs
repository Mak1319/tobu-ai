//! MongoDB access for the `UploadedFile` collection.
//!
//! Mirrors the Python worker's `store.py`: atomic claim via
//! `findOneAndUpdate({_id, processingStatus: pending} → processing)`,
//! plus typed helpers for `mark_ready`, `mark_failed`, `reset_to_pending`,
//! and the `flagged` flag.
//!
//! All public functions are async — the listener / reconciler call them
//! via `tokio::task::spawn_blocking` if they need to run on a blocking
//! thread, but the underlying `mongodb` driver is already async so
//! straight `.await` is usually fine.

use anyhow::{anyhow, Context, Result};
use bson::{doc, Bson, DateTime as BsonDateTime, Document};
use chrono::Utc;
use futures_util::TryStreamExt;
use mongodb::{
    options::{FindOneAndUpdateOptions, ReturnDocument},
    Client, Collection, IndexModel,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Shape of one `UploadedFile` row from Mongo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadRecord {
    #[serde(rename = "_id")]
    pub mongo_id: String,
    pub chat_id: String,
    pub bucket: String,
    pub key: String,
    pub filename: String,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub processing_status: String,
}

/// Connect, ping, ensure indexes, return the collection handle.
pub async fn connect(uri: &str, db: &str, collection: &str) -> Result<Collection<Document>> {
    let client = Client::with_uri_str(uri)
        .await
        .context("failed to construct Mongo client")?;
    client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await
        .context("Mongo ping failed — bad URI or unreachable host")?;
    let coll = client.database(db).collection(collection);
    ensure_indexes(&coll).await?;
    Ok(coll)
}

async fn ensure_indexes(coll: &Collection<Document>) -> Result<()> {
    let indexes = vec![
        IndexModel::builder()
            .keys(doc! { "key": 1 })
            .options(
                mongodb::options::IndexOptions::builder()
                    .unique(true)
                    .build(),
            )
            .build(),
        IndexModel::builder()
            .keys(doc! { "processingStatus": 1 })
            .build(),
        IndexModel::builder()
            .keys(doc! { "processingStatus": 1, "updatedAt": 1 })
            .build(),
    ];
    coll.create_indexes(indexes)
        .await
        .context("failed to ensure uploadedfiles indexes")?;
    Ok(())
}

/// Atomic `pending → processing` claim.
pub async fn claim(coll: &Collection<Document>, id: &str) -> Result<bool> {
    let object_id = bson::oid::ObjectId::parse_str(id)
        .with_context(|| format!("row {id} has non-ObjectId _id"))?;
    let now = BsonDateTime::now();
    let opts = FindOneAndUpdateOptions::builder()
        .return_document(ReturnDocument::After)
        .build();
    let res = coll
        .find_one_and_update(
            doc! { "_id": object_id, "processingStatus": "pending" },
            doc! { "$set": { "processingStatus": "processing", "updatedAt": now } },
        )
        .with_options(opts)
        .await
        .context("claim find_one_and_update failed")?;
    Ok(res.is_some())
}

/// List rows we should process: `pending`, plus `processing` rows whose
/// `updatedAt` is older than `stuck_after` (worker crashed mid-docling).
pub async fn list_pending_or_stuck(
    coll: &Collection<Document>,
    stuck_after: Duration,
) -> Result<Vec<UploadRecord>> {
    let cutoff = Utc::now()
        - chrono::Duration::from_std(stuck_after).unwrap_or_else(|_| chrono::Duration::minutes(10));
    let cutoff_bson = BsonDateTime::from_millis(cutoff.timestamp_millis());
    let filter = doc! {
        "$or": [
            { "processingStatus": "pending" },
            {
                "processingStatus": "processing",
                "updatedAt": { "$lt": cutoff_bson }
            },
        ]
    };
    let cursor = coll
        .find(filter)
        .await
        .context("pending sweep find failed")?;
    let docs: Vec<Document> = cursor
        .try_collect()
        .await
        .context("pending sweep cursor failed")?;
    let mut out = Vec::with_capacity(docs.len());
    for d in docs {
        match bson::from_document::<UploadRecord>(d) {
            Ok(rec) => out.push(rec),
            Err(e) => tracing::warn!(error = %e, "skipped unparseable row in pending sweep"),
        }
    }
    Ok(out)
}

/// Reset a `processing` row back to `pending`.
pub async fn reset_to_pending(coll: &Collection<Document>, id: &str) -> Result<()> {
    let object_id = bson::oid::ObjectId::parse_str(id)
        .with_context(|| format!("row {id} has non-ObjectId _id"))?;
    let now = BsonDateTime::now();
    coll.update_one(
        doc! { "_id": object_id, "processingStatus": "processing" },
        doc! { "$set": { "processingStatus": "pending", "updatedAt": now } },
    )
    .await
    .context("reset_to_pending update_one failed")?;
    Ok(())
}

/// Look up a row by `key`.
pub async fn find_by_key(coll: &Collection<Document>, key: &str) -> Result<Option<UploadRecord>> {
    let maybe = coll
        .find_one(doc! { "key": key })
        .await
        .context("find_by_key failed")?;
    Ok(match maybe {
        Some(d) => Some(bson::from_document::<UploadRecord>(d).context("row failed to deserialize")?),
        None => None,
    })
}

pub async fn mark_ready(
    coll: &Collection<Document>,
    id: &str,
    content_hash: &str,
    processed_key: &str,
    flagged: bool,
) -> Result<()> {
    let object_id = bson::oid::ObjectId::parse_str(id)
        .with_context(|| format!("row {id} has non-ObjectId _id"))?;
    let now = BsonDateTime::now();
    let set = doc! {
        "processingStatus": "ready",
        "processingError": Bson::Null,
        "processedAt": now,
        "updatedAt": now,
        "contentHash": content_hash,
        "processedKey": processed_key,
        "flagged": flagged,
    };
    let res = coll
        .update_one(doc! { "_id": object_id }, doc! { "$set": set })
        .await
        .context("mark_ready update_one failed")?;
    if res.matched_count == 0 {
        return Err(anyhow!("mark_ready: no row matched _id {id}"));
    }
    Ok(())
}

pub async fn mark_failed(coll: &Collection<Document>, id: &str, message: &str) -> Result<()> {
    let object_id = bson::oid::ObjectId::parse_str(id)
        .with_context(|| format!("row {id} has non-ObjectId _id"))?;
    let now = BsonDateTime::now();
    let truncated = message.chars().take(2_000).collect::<String>();
    let res = coll
        .update_one(
            doc! { "_id": object_id },
            doc! { "$set": {
                "processingStatus": "failed",
                "processingError": truncated,
                "updatedAt": now,
            } },
        )
        .await
        .context("mark_failed update_one failed")?;
    if res.matched_count == 0 {
        return Err(anyhow!("mark_failed: no row matched _id {id}"));
    }
    Ok(())
}
