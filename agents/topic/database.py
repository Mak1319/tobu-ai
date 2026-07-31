import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "tobu_ai")

client: AsyncMongoClient
db: AsyncDatabase
users_collection: AsyncCollection


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db, users_collection
    client = AsyncMongoClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    users_collection = db["users"]

    # Enforce unique email constraint at the database engine level
    await users_collection.create_index("email", unique=True)
    yield
    # Properly close connection pool on shutdown
    await client.close()
