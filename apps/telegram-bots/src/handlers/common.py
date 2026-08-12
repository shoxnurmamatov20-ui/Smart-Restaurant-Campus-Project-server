"""Shared command handlers used by every bot (e.g. /help, /cancel).

Per-bot routers can `include_router(build_help_router())` to get a
consistent help message and /cancel handler for free.
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from src.middlewares.i18n import Translator


def build_help_router(*, contact_handle: str = "@RestaurantCampusSupport") -> Router:
    """A simple /help router with localized text and a support handle footer."""
    router = Router(name="common:help")

    @router.message(Command("help"))
    async def _help(message: Message, i18n: Translator) -> None:
        body = {
            "uz": (
                "ℹ️ <b>Bot komandalari</b>\n\n"
                "/menu — asosiy menyu\n"
                "/help — yordam\n"
                "/cancel — joriy amaliyotni bekor qilish"
            ),
            "ru": (
                "ℹ️ <b>Команды бота</b>\n\n"
                "/menu — главное меню\n"
                "/help — помощь\n"
                "/cancel — отменить текущее действие"
            ),
            "en": (
                "ℹ️ <b>Bot commands</b>\n\n"
                "/menu — main menu\n"
                "/help — help\n"
                "/cancel — cancel the current flow"
            ),
        }.get(i18n.locale, "")
        await message.answer(f"{body}\n\nMuammo bo'lsa: {contact_handle}")

    return router


def build_cancel_router() -> Router:
    """A /cancel router that clears any FSM state and confirms in the user's locale."""
    router = Router(name="common:cancel")

    @router.message(Command("cancel"))
    @router.message(F.text.casefold() == "cancel")
    async def _cancel(message: Message, state: FSMContext, i18n: Translator) -> None:
        await state.clear()
        text = {
            "uz": "✅ Bekor qilindi.",
            "ru": "✅ Отменено.",
            "en": "✅ Cancelled.",
        }.get(i18n.locale, "✅ Cancelled.")
        await message.answer(text)

    return router
