"""Redis-backed per-user rate limit (20 msg / 60 s by default)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

import structlog
from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)


class RateLimitMiddleware(BaseMiddleware):
    """Throttles users via Redis INCR + EXPIRE."""

    def __init__(self, redis: Redis, *, max_per_window: int = 20, window_sec: int = 60) -> None:
        self.redis = redis
        self.max = max_per_window
        self.window = window_sec

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user_id: int | None = None
        if isinstance(event, (Message, CallbackQuery)) and event.from_user:
            user_id = event.from_user.id

        if user_id is None:
            return await handler(event, data)

        bot = data.get("bot")
        bot_id = getattr(bot, "id", "unknown") if bot else "unknown"
        key = f"campus:tg:ratelimit:{bot_id}:{user_id}"
        try:
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, self.window)
        except Exception as e:  # noqa: BLE001
            logger.warning("rate_limit.redis_error", error=str(e))
            return await handler(event, data)

        if count > self.max:
            logger.warning("rate_limit.exceeded", user_id=user_id, count=count)
            if isinstance(event, Message):
                await event.answer("⚠️ Juda ko'p so'rov. Bir daqiqa kutib turing.")
            elif isinstance(event, CallbackQuery):
                await event.answer("⚠️ Sekinroq", show_alert=True)
            return None

        return await handler(event, data)
