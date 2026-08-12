"""Shared base router builder — used by full-handler bots.

Each bot's main router (`src/bots/<key>.py`) should be built on top of this
so it inherits /help and /cancel handlers for free, keeping behavior
consistent across all 50 bots.

Usage:

    from src.bots._base import build_base_router
    from src.bots.registry import BOTS_BY_KEY

    router = build_base_router(BOTS_BY_KEY["guest"])

    @router.message(Command("tables"))
    async def schedule(...): ...
"""

from __future__ import annotations

from aiogram import Router

from src.bots.registry import BotDefinition
from src.handlers.common import build_cancel_router, build_help_router


def build_base_router(
    definition: BotDefinition,
    *,
    contact_handle: str = "@RestaurantCampusSupport",
) -> Router:
    """Return a Router pre-wired with /help and /cancel handlers."""
    router = Router(name=f"bot:{definition.key}")
    router.include_router(build_help_router(contact_handle=contact_handle))
    router.include_router(build_cancel_router())
    return router
