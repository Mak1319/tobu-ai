import os
import threading
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MONGODB_URL = os.getenv(
    "MONGODB_URL",
    os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
)
DATABASE_NAME = os.getenv("DATABASE_NAME", os.getenv("MONGO_DB", "tobu_ai"))

client: AsyncMongoClient
db: AsyncDatabase
answer_scores_collection: AsyncCollection

_worker_stop: list[bool] = [False]
_worker_threads: list[threading.Thread] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db, answer_scores_collection
    client = AsyncMongoClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    answer_scores_collection = db["answer_scores"]

    from shared.redis_bus import close_bus, get_bus

    get_bus()  # fail fast if Redis is down
    _worker_stop[0] = False

    from answer_analyzer_agent.worker import run_forever as aa_run
    from question_generator_agent.worker import run_forever as qg_run

    qg_thread = threading.Thread(
        target=qg_run, args=(_worker_stop,), name="qg-redis-worker", daemon=True
    )
    aa_thread = threading.Thread(
        target=aa_run, args=(_worker_stop,), name="aa-redis-worker", daemon=True
    )
    qg_thread.start()
    aa_thread.start()
    _worker_threads[:] = [qg_thread, aa_thread]

    yield

    _worker_stop[0] = True
    close_bus()
    from shared.checkpointer import close_checkpointer

    close_checkpointer()
    await client.close()


async def store_score(doc: dict[str, Any]) -> None:
    """Persist an answer score document. Safe no-op if lifespan not started."""
    payload = {
        **doc,
        "created_at": doc.get("created_at") or datetime.now(UTC),
    }
    try:
        await answer_scores_collection.insert_one(payload)
    except NameError:
        pass


def store_score_sync(doc: dict[str, Any]) -> None:
    """Sync insert for graph nodes that are not async-mongo aware."""
    from pymongo import MongoClient

    sync_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=2000)
    try:
        coll = sync_client[DATABASE_NAME]["answer_scores"]
        coll.insert_one(
            {
                **doc,
                "created_at": doc.get("created_at") or datetime.now(UTC),
            }
        )
    except Exception:
        pass
    finally:
        sync_client.close()
