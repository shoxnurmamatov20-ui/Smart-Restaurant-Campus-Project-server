"""Auth middleware — injects the linked platform user into handler data.

Looks up the Telegram user in `tg_bot_users` (via Laravel API) and caches
the result in Redis for 60 seconds to avoid hammering Laravel per message.

Wired up in bot_manager.setup() as an outer middleware.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject
from redis.asyncio import Redis

from src.core.api_client import laravel

logger = structlog.get_logger(__name__)


CACHE_TTL_SEC = 60


class AuthMiddleware(BaseMiddleware):
    """Looks up the linked platform user and injects `app_user` into data dict.

    The bot must have set `bot._src_bot_key` so the middleware knows which
    `bots/{key}/users/...` endpoint to call. bot_manager.setup() does this.
    """

    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = getattr(event, "from_user", None)
        bot = data.get("bot")
        bot_key = getattr(bot, "_src_bot_key", None) if bot else None

        if not user or not bot_key:
            data["app_user"] = None
            return await handler(event, data)

        cache_key = f"src:tg:linked:{bot_key}:{user.id}"
        try:
            cached = await self.redis.get(cache_key)
        except Exception as e:  # noqa: BLE001
            logger.warning("auth.cache_get_failed", error=str(e))
            cached = None

        if cached:
            try:
                data["app_user"] = json.loads(cached.decode())
            except Exception:
                data["app_user"] = None
            return await handler(event, data)

        try:
            linked = await laravel.get_linked_user(bot_key=bot_key, telegram_id=user.id)
        except Exception as e:  # noqa: BLE001
            logger.warning("auth.lookup_failed", error=str(e), bot=bot_key, telegram_id=user.id)
            linked = None

        if linked:
            try:
                await self.redis.setex(cache_key, CACHE_TTL_SEC, json.dumps(linked))
            except Exception:
                pass
            data["app_user"] = linked
        else:
            data["app_user"] = None

        return await handler(event, data)
