"""Filter requiring the Telegram user to be linked to a platform account."""

from __future__ import annotations

from typing import Any

from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject


class IsLinked(BaseFilter):
    """Match only if the Telegram user has a `tg_bot_users` row.

    The auth middleware sets data["app_user"] when linked, or None otherwise.
    """

    async def __call__(self, event: TelegramObject, **data: Any) -> bool:
        return data.get("app_user") is not None
