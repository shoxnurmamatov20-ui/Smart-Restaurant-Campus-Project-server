"""Multi-bot dispatcher manager.

Builds aiogram 3 Bot instances for each registered bot that has a token,
wires them into a shared Dispatcher with shared middlewares and per-bot
routers, and exposes the dispatcher's webhook handlers to FastAPI.
"""

from __future__ import annotations

import importlib
import os
from typing import Any

import structlog
from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from src.bots.registry import ALL_BOTS, BotDefinition
from src.core.config import settings

logger = structlog.get_logger(__name__)


class BotManager:
    """Holds aiogram Dispatcher + per-bot Bot instances + webhook routing."""

    def __init__(self) -> None:
        self.dispatcher: Dispatcher | None = None
        self.bots: dict[str, Bot] = {}              # key -> Bot
        self.definitions: dict[str, BotDefinition] = {}
        self.redis: Redis | None = None

    async def setup(self) -> None:
        """Wire dispatcher, FSM storage, middlewares, and handlers for all enabled bots."""
        self.redis = Redis.from_url(settings.redis_url, decode_responses=False)
        storage = RedisStorage(self.redis)
        self.dispatcher = Dispatcher(storage=storage)

        # Shared middlewares (applied to every bot)
        from src.middlewares.api_client import APIClientMiddleware
        from src.middlewares.i18n import I18nMiddleware
        from src.middlewares.logging import LoggingMiddleware
        from src.middlewares.rate_limit import RateLimitMiddleware

        for mw in (
            LoggingMiddleware(),
            RateLimitMiddleware(self.redis),
            I18nMiddleware(),
            APIClientMiddleware(),
        ):
            self.dispatcher.update.outer_middleware(mw)
            self.dispatcher.message.outer_middleware(mw)
            self.dispatcher.callback_query.outer_middleware(mw)

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
            self.bots[definition.key] = bot
            self.definitions[definition.key] = definition

            # Load per-bot router if module exists; otherwise use generic skeleton
            router = self._load_router(definition)
            self.dispatcher.include_router(router)

            logger.info("bot.registered", bot=definition.key, name=definition.name_en)

        logger.info("bot_manager.ready", enabled=len(self.bots), total=len(ALL_BOTS))

    def _load_router(self, definition: BotDefinition) -> Router:
        """Import src.bots.<key> and return its `router` attribute, or build a stub."""
        try:
            mod = importlib.import_module(f"src.bots.{definition.key}")
            router = getattr(mod, "router", None)
            if isinstance(router, Router):
                return router
            logger.warning("bot.router.invalid", bot=definition.key)
        except ImportError:
            logger.info("bot.router.using_stub", bot=definition.key)

        # Fallback: stub router that replies with "modul tez orada" for any message
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
