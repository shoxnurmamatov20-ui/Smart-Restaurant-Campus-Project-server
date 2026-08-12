"""Multi-bot dispatcher manager.

Builds aiogram 3 Bot instances for each registered bot that has a token,
wires them into a shared Dispatcher with shared middlewares and per-bot
routers, and exposes the dispatcher's webhook handlers to FastAPI.

Handler module lookup order (first match wins):
  1. src.bots.{key}                          — flat (legacy, current)
  2. src.bots.{phase_dir}.{key}              — phase-grouped (phase1, phase2)
  3. src.bots.ai.{key}                       — for LLM-backed bots (menu_ai)
  4. src.bots.branch.{key}                   — for br_* keys
  5. src.bots.concept.{key}                  — for concept_* keys
  6. _stub.py fallback (replies "modul tez orada")
"""

from __future__ import annotations

import importlib
import os
from typing import Any

import structlog
from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from redis.asyncio import Redis

from src.bots.registry import ALL_BOTS, BotDefinition, BotPhase
from src.core.config import settings
from src.core.fsm_storage import build_fsm_storage, build_redis
from src.handlers.errors import global_error_handler

logger = structlog.get_logger(__name__)


AI_KEYS = {"menu_ai"}


def _module_candidates(definition: BotDefinition) -> list[str]:
    """Return module-path candidates to try for this bot, ordered by preference."""
    candidates = [f"src.bots.{definition.key}"]

    phase_dir = {
        BotPhase.PHASE_1: "phase1",
        BotPhase.PHASE_2: "phase2",
        BotPhase.PHASE_3: "phase3",
    }.get(definition.phase)
    if phase_dir:
        candidates.append(f"src.bots.{phase_dir}.{definition.key}")

    if definition.key in AI_KEYS:
        candidates.append(f"src.bots.ai.{definition.key}")

    if definition.key.startswith("br_"):
        candidates.append(f"src.bots.branch.{definition.key}")

    if definition.key.startswith("concept_"):
        candidates.append(f"src.bots.concept.{definition.key}")

    return candidates


class BotManager:
    """Holds aiogram Dispatcher + per-bot Bot instances + webhook routing."""

    def __init__(self) -> None:
        self.dispatcher: Dispatcher | None = None
        self.bots: dict[str, Bot] = {}              # key -> Bot
        self.definitions: dict[str, BotDefinition] = {}
        self.redis: Redis | None = None

    async def setup(self) -> None:
        """Wire dispatcher, FSM storage, middlewares, and handlers for all enabled bots."""
        self.redis = build_redis()
        storage = build_fsm_storage(self.redis)
        self.dispatcher = Dispatcher(storage=storage)

        # Shared middlewares (applied to every bot)
        from src.middlewares.api_client import APIClientMiddleware
        from src.middlewares.auth import AuthMiddleware
        from src.middlewares.feature_flags import FeatureFlagMiddleware
        from src.middlewares.i18n import I18nMiddleware
        from src.middlewares.logging import LoggingMiddleware
        from src.middlewares.rate_limit import RateLimitMiddleware

        for mw in (
            LoggingMiddleware(),
            RateLimitMiddleware(self.redis),
            I18nMiddleware(),
            APIClientMiddleware(),
            AuthMiddleware(self.redis),
            FeatureFlagMiddleware(),
        ):
            self.dispatcher.update.outer_middleware(mw)
            self.dispatcher.message.outer_middleware(mw)
            self.dispatcher.callback_query.outer_middleware(mw)

        # Global error handler — translates BotError → friendly Telegram messages
        self.dispatcher.errors.register(global_error_handler)

        # Register each bot
        for definition in ALL_BOTS:
            token = os.getenv(definition.env_var, "").strip()
            if not token:
                logger.info("bot.skipped", bot=definition.key, reason="no_token")
                continue

            bot = Bot(
                token=token,
                default=DefaultBotProperties(parse_mode=ParseMode.HTML),
            )
            # Tag the Bot so middlewares can look up the bot_key without a reverse map
            bot._src_bot_key = definition.key  # type: ignore[attr-defined]

            self.bots[definition.key] = bot
            self.definitions[definition.key] = definition

            # Load per-bot router from any of the supported module paths
            router = self._load_router(definition)
            self.dispatcher.include_router(router)

            logger.info("bot.registered", bot=definition.key, name=definition.name_en)

        logger.info("bot_manager.ready", enabled=len(self.bots), total=len(ALL_BOTS))

    def _load_router(self, definition: BotDefinition) -> Router:
        """Try each candidate module path; use stub if none has a valid `router`."""
        for path in _module_candidates(definition):
            try:
                mod = importlib.import_module(path)
            except ImportError:
                continue
            except Exception as e:  # noqa: BLE001
                logger.error("bot.router.import_error", bot=definition.key, path=path, error=str(e))
                continue

            router = getattr(mod, "router", None)
            if isinstance(router, Router):
                logger.info("bot.router.loaded", bot=definition.key, path=path)
                return router
            logger.warning("bot.router.invalid", bot=definition.key, path=path)

        logger.info("bot.router.using_stub", bot=definition.key)
        from src.bots._stub import build_stub_router

        return build_stub_router(definition)

    async def set_webhooks(self) -> None:
        """Register webhook URL with Telegram for every enabled bot."""
        base = settings.public_webhook_url.rstrip("/")
        secret = settings.webhook_secret_token
        for key, bot in self.bots.items():
            url = f"{base}/tg/webhook/{key}"
            try:
                await bot.set_webhook(
                    url=url,
                    secret_token=secret,
                    drop_pending_updates=True,
                    allowed_updates=["message", "callback_query", "inline_query"],
                )
                logger.info("webhook.set", bot=key, url=url)
            except Exception as e:  # noqa: BLE001
                logger.error("webhook.set.failed", bot=key, error=str(e))

    async def delete_webhooks(self) -> None:
        for key, bot in self.bots.items():
            try:
                await bot.delete_webhook(drop_pending_updates=False)
                logger.info("webhook.deleted", bot=key)
            except Exception as e:  # noqa: BLE001
                logger.warning("webhook.delete.failed", bot=key, error=str(e))

    async def shutdown(self) -> None:
        for bot in self.bots.values():
            await bot.session.close()
        if self.redis:
            await self.redis.aclose()

    def get(self, key: str) -> Bot | None:
        return self.bots.get(key)

    async def process_update(self, key: str, update_data: dict[str, Any]) -> None:
        """Feed a webhook payload into the dispatcher for the named bot."""
        bot = self.bots.get(key)
        if not bot or not self.dispatcher:
            raise KeyError(f"Unknown bot: {key}")
        from aiogram.types import Update

        update = Update.model_validate(update_data, context={"bot": bot})
        await self.dispatcher.feed_update(bot, update)


# Singleton
manager = BotManager()
