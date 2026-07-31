import os

from dotenv import load_dotenv

load_dotenv()


from redis.asyncio import Redis

REDIS_URL = os.getenv("REDIS_URL", "")
r = Redis.from_url(REDIS_URL)
