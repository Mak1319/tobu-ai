"""MongoDB access for hashContentMap."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from pymongo import MongoClient
from pymongo.collection import Collection

from config import Settings

log = logging.getLogger("topicable.mongo")


class HashStore:
    def __init__(self, settings: Settings) -> None:
        log.debug("mongo connect url=%s", settings.mongodb_url)
        self.client = MongoClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        self.db_name = settings.mongodb_db
        self.collection_name = settings.hash_collection
        self.collection: Collection = self.client[self.db_name][self.collection_name]
        try:
            hello = self.client.admin.command("ping")
            log.info("mongo ping ok db=%s collection=%s", self.db_name, self.collection_name)
            log.debug("mongo ping response=%s", hello)
        except Exception as exc:
            log.error("mongo ping failed: %s", exc)
            raise
        index_name = self.collection.create_index("hashId", unique=True)
        log.debug("ensured unique index hashId name=%s", index_name)

    def find_by_hash(self, file_hash: str) -> dict[str, Any] | None:
        log.debug(
            "find_one {%s: %s} on %s.%s",
            "hashId",
            file_hash,
            self.db_name,
            self.collection_name,
        )
        doc = self.collection.find_one({"hashId": file_hash})
        if doc:
            log.info("cache hit hashId=%s _id=%s", file_hash, doc.get("_id"))
            log.debug(
                "cached doc keys=%s updatedAt=%s",
                list(doc.keys()),
                doc.get("updatedAt"),
            )
        else:
            log.debug("cache miss hashId=%s", file_hash)
        return doc

    def upsert(self, file_hash: str, content: dict[str, Any]) -> None:
        now = datetime.now(UTC)
        log.debug(
            "upsert hashId=%s content_keys=%s",
            file_hash,
            list(content.keys()),
        )
        result = self.collection.update_one(
            {"hashId": file_hash},
            {
                "$set": {
                    "hashId": file_hash,
                    "content": content,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        log.info(
            "stored hashContentMap hashId=%s matched=%s modified=%s upserted_id=%s",
            file_hash,
            result.matched_count,
            result.modified_count,
            result.upserted_id,
        )

    def close(self) -> None:
        log.debug("closing mongo client")
        self.client.close()
