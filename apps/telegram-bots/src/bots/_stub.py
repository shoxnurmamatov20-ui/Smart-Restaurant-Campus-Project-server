"""Stub router for bots that don't have a dedicated handler module yet."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from src.bots.registry import BotDefinition


def build_stub_router(definition: BotDefinition) -> Router:
    """Return a router that politely replies "modul tez orada" for any input."""
    router = Router(name=f"stub:{definition.key}")

    @router.message(CommandStart())
    async def _start(message: Message) -> None:
        await message.answer(
            f"<b>{definition.name_uz}</b>\n\n"
            f"Bu bot <b>{definition.purpose}</b> uchun. "
            f"Hozircha tayyor emas — tez orada ishga tushadi. 🚧"
        )

    @router.message(F.text)
    async def _any(message: Message) -> None:
        await message.answer("Bu bot hali tayyor emas. /start bilan tekshiring.")

    return router
