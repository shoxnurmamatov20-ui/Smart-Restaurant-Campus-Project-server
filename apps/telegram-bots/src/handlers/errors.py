"""Global error handler — wired into the dispatcher.

Catches `BotError` subclasses (translated to friendly messages) and
logs everything else with stack info. Always answers Telegram so the
update isn't redelivered.
"""

from __future__ import annotations

import structlog
from aiogram.types import ErrorEvent

from src.core.exceptions import (
    FeatureDisabledError,
    LaravelUnavailableError,
    NotLinkedError,
    RoleNotAllowedError,
)

logger = structlog.get_logger(__name__)


async def global_error_handler(event: ErrorEvent) -> None:
    """Catches any unhandled exception from a bot handler.

    Registered via `dispatcher.errors.register(global_error_handler)` in bot_manager.
    """
    update = event.update
    exc = event.exception
    target_msg = getattr(update, "message", None) or getattr(
        getattr(update, "callback_query", None), "message", None
    )

    async def _reply(text: str) -> None:
        if target_msg:
            try:
                await target_msg.answer(text)
            except Exception:
                pass

    if isinstance(exc, NotLinkedError):
        await _reply("⚠️ Bu amal uchun avval /start orqali ro'yxatdan o'ting.")
        return

    if isinstance(exc, RoleNotAllowedError):
        await _reply("⛔ Bu komanda sizning rolingiz uchun ruxsat etilmagan.")
        return

    if isinstance(exc, FeatureDisabledError):
        await _reply("🚧 Bu funksiya hozircha o'chirilgan.")
        return

    if isinstance(exc, LaravelUnavailableError):
        await _reply("🔧 Tizim hozircha javob bermayapti. Birozdan keyin urinib ko'ring.")
        return

    logger.exception("bot.unhandled_exception", error=str(exc))
    await _reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
