"""FastAPI host for the multi-bot dispatcher.

Routes:
  GET  /                       service info
  GET  /health                 liveness + bot count + service deps
  GET  /metrics                Prometheus metrics
  GET  /docs                   OpenAPI swagger (dev only)
  GET  /bots                   list registered bots (for admin UI)
  POST /tg/webhook/{bot_key}   Telegram webhook (called BY Telegram servers)
  POST /internal/send/{bot_key} Send message from Laravel queue (auth: internal token)
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from src.bots.registry import ALL_BOTS, BOTS_BY_KEY
from src.core.api_client import laravel
from src.core.bot_manager import manager
from src.core.config import settings
from src.core.logging import configure_logging

configure_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("telegram_bots.startup", env=settings.app_env, total_bots=len(ALL_BOTS))
    await laravel.start()
    await manager.setup()
    if not settings.app_debug:
        # In production we set webhooks on startup
        await manager.set_webhooks()
    logger.info("telegram_bots.ready", enabled=len(manager.bots))
    yield
    logger.info("telegram_bots.shutdown")
    if not settings.app_debug:
        await manager.delete_webhooks()
    await manager.shutdown()
    await laravel.stop()


app = FastAPI(
    title="CAMPUS Telegram Bots",
    description="Multi-bot dispatcher (10–50 bots) backed by aiogram 3.",
    version=settings.app_version,
    docs_url="/docs" if settings.app_debug else None,
    redoc_url="/redoc" if settings.app_debug else None,
    openapi_url="/openapi.json" if settings.app_debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, Any]:
    return {
        "service": "CAMPUS Telegram Bots",
        "version": settings.app_version,
        "total_registered": len(ALL_BOTS),
        "enabled": list(manager.bots.keys()),
    }


@app.get("/health", tags=["health"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "campus-telegram-bots",
        "enabled_bots": len(manager.bots),
        "total_bots": len(ALL_BOTS),
    }


@app.get("/bots", tags=["admin"])
async def list_bots() -> list[dict[str, Any]]:
    """Returns metadata for every defined bot (for admin UI rendering)."""
    return [
        {
            "key": b.key,
            "name_uz": b.name_uz,
            "name_ru": b.name_ru,
            "name_en": b.name_en,
            "purpose": b.purpose,
            "audience": b.audience.value,
            "module": b.module,
            "phase": b.phase.value,
            "commands": list(b.commands),
            "enabled": b.key in manager.bots,
            "requires_phone": b.requires_phone,
            "requires_login": b.requires_login,
        }
        for b in ALL_BOTS
    ]


@app.post("/tg/webhook/{bot_key}", tags=["telegram"])
async def telegram_webhook(
    bot_key: str,
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, str]:
    """Telegram pings here for every update."""
    if bot_key not in BOTS_BY_KEY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown bot")
    if bot_key not in manager.bots:
        # Bot defined but not enabled (no token configured)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot disabled")
    if x_telegram_bot_api_secret_token != settings.webhook_secret_token:
        logger.warning("webhook.secret.mismatch", bot=bot_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad secret")

    try:
        update = await request.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("webhook.bad_payload", bot=bot_key, error=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad JSON") from e

    try:
        await manager.process_update(bot_key, update)
    except Exception:  # noqa: BLE001
        logger.exception("webhook.process.failed", bot=bot_key)
        # Always 200 so Telegram doesn't retry
        return {"status": "error"}
    return {"status": "ok"}


@app.post("/internal/send/{bot_key}", tags=["internal"])
async def internal_send(
    bot_key: str,
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Outbound message API — called by Laravel queues via internal token.

    Payload: {chat_id: int, text: str, parse_mode?: "HTML", reply_markup?: dict}
    """
    if not settings.laravel_internal_token:
        raise HTTPException(status_code=500, detail="Internal token not configured on bot service")
    expected = f"Bearer {settings.laravel_internal_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    bot = manager.get(bot_key)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot disabled or unknown")

    chat_id = payload.get("chat_id")
    text = payload.get("text")
    if not chat_id or not text:
        raise HTTPException(status_code=422, detail="chat_id and text required")

    msg = await bot.send_message(
        chat_id=chat_id,
        text=text,
        parse_mode=payload.get("parse_mode", "HTML"),
        reply_markup=payload.get("reply_markup"),
        disable_web_page_preview=payload.get("disable_web_page_preview", True),
    )
    return {"message_id": msg.message_id, "chat_id": msg.chat.id}
