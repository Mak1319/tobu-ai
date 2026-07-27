//! Startup + reconnect reconciliation.
//!
//! MinIO bucket notifications are best-effort — events can be missed
//! across restarts, network blips, or short outages. We sweep Mongo on
//! startup and after every reconnect, picking up:
//!
//!  * rows still in `pending` (never processed)
//!  * rows stuck in `processing` past `stuck_after` (worker crashed
//!    mid-docling)
//!
//! For each, we reset `processing` → `pending` and run the same pipeline
//! the listener would have.

use std::time::Duration;

use bson::Document;
use mongodb::Collection;

use crate::mongo;

pub async fn run_once<F, Fut>(
    coll: &Collection<Document>,
    stuck_after: Duration,
    process: F,
) -> usize
where
    F: Fn(mongo::UploadRecord) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let rows = match mongo::list_pending_or_stuck(coll, stuck_after).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(error = %e, "reconciler list failed");
            return 0;
        }
    };

    if rows.is_empty() {
        return 0;
    }
    tracing::info!(count = rows.len(), "reconciler picked up rows");
    let mut handled = 0;
    for row in rows {
        let id = row.mongo_id.clone();
        let coll_reset = coll.clone();
        let _ = mongo::reset_to_pending(&coll_reset, &id).await;
        process(row).await;
        handled += 1;
    }
    handled
}
