import json
import os

import redis
from dotenv import load_dotenv

from tasks import process_document

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "changeme")
PUBSUB_CHANNEL = os.getenv("PUBSUB_CHANNEL", "seaweedfs_filer")

r = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD,
)

pubsub = r.pubsub()
pubsub.subscribe(PUBSUB_CHANNEL)

for message in pubsub.listen():
    if message["type"] != "message":
        continue

    try:
        event = json.loads(message["data"])
    except (ValueError, TypeError):
        continue

    file_key = event.get("key") or event.get("path") or event.get("FullPath")
    if not file_key:
        continue

    meta = event.get("metadata") or event.get("MetaData") or {}
    session_id = meta.get("session_id") or meta.get("sessionId") or meta.get("session-id")
    if not session_id:
        continue

    process_document.delay(file_key, session_id)