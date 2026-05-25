"""Logs every update with bot, user, command, and latency."""

from __future__ import annotations

import time
from typing import Any, Awaitable, Callable

import structlog
from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

logger = structlog.get_logger(__name__)


class LoggingMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        bot = data.get("bot")
        bot_id = getattr(bot, "id", None) if bot else None
        user_id: int | None = None
        command: str | None = None

        if isinstance(event, Message):
            user_id = event.from_user.id if event.from_user else None
            command = event.text.split()[0] if event.text and event.text.startswith("/") else None
        elif isinstance(event, CallbackQuery):
            user_id = event.from_user.id if event.from_user else None
            command = f"cb:{event.data}"

        started = time.perf_counter()
        try:
            result = await handler(event, data)
            latency_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "bot.update",
                bot_id=bot_id,
                user_id=user_id,
                command=command,
                latency_ms=latency_ms,
            )
            return result
        except Exception as e:  # noqa: BLE001
            latency_ms = int((time.perf_counter() - started) * 1000)
            logger.exception(
                "bot.update.error",
                bot_id=bot_id,
                user_id=user_id,
                command=command,
                latency_ms=latency_ms,
                error=str(e),
            )
            raise
