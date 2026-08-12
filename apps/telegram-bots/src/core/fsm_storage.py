"""Redis FSM storage builder for aiogram 3.

Wraps the connection logic in one place so test helpers and bot_manager
share the same construction path.
"""

from __future__ import annotations

from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from src.core.config import settings


def build_redis() -> Redis:
    """Return a configured async Redis client."""
    return Redis.from_url(settings.redis_url, decode_responses=False)


def build_fsm_storage(redis: Redis | None = None) -> RedisStorage:
    """Build a Redis-backed FSM storage. If a `redis` client is given, reuse it."""
    return RedisStorage(redis or build_redis())
