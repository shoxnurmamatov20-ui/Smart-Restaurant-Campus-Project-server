"""Feature-flag middleware — disables commands/handlers per env or DB config.

Reads disabled-command list from the bot's tg_bots.metadata JSON column
(synced from Laravel) and silently raises FeatureDisabledError, which the
global error handler turns into a user-friendly "🚧 disabled" message.

Stub for now — wire to real metadata lookup when bot management UI grows.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject


class FeatureFlagMiddleware(BaseMiddleware):
    """Per-bot command toggle — currently a no-op pass-through."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        # TODO: load disabled commands from bot's metadata; check event matches; raise if disabled.
        return await handler(event, data)
