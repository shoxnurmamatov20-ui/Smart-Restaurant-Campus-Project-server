"""HTTPX client to Laravel API — used by every bot for business operations.

All actions that touch business data MUST go through this client.
Direct DB writes from the bot process are forbidden (Laravel is source of truth).
"""

from __future__ import annotations

from typing import Any, Self

import httpx
import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.core.config import settings

logger = structlog.get_logger(__name__)


class LaravelAPIError(Exception):
    """Raised when Laravel API returns 4xx/5xx."""

    def __init__(self, status: int, body: dict[str, Any] | str) -> None:
        self.status = status
        self.body = body
        super().__init__(f"Laravel API error {status}: {body}")


class LaravelClient:
    """Thin async wrapper around Laravel API.

    Authenticates with `LARAVEL_INTERNAL_TOKEN` (bot-shared service-account token).
    User-specific actions pass an additional X-Telegram-User header with telegram_id;
    Laravel looks up the linked CAMPUS user from tg_bot_users.
    """

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> Self:
        self._client = httpx.AsyncClient(
            base_url=settings.laravel_api_url,
            timeout=httpx.Timeout(15.0, connect=5.0),
            headers={
                "Accept": "application/json",
                "User-Agent": "campus-telegram-bots/0.0.0",
            },
        )
        return self

    async def __aexit__(self, *_args: object) -> None:
        if self._client:
            await self._client.aclose()

    def _ensure(self) -> httpx.AsyncClient:
        if not self._client:
            raise RuntimeError("LaravelClient not entered — use 'async with' or call .start()")
        return self._client

    async def start(self) -> None:
        if not self._client:
            self._client = httpx.AsyncClient(
                base_url=settings.laravel_api_url,
                timeout=httpx.Timeout(15.0, connect=5.0),
                headers={
                    "Accept": "application/json",
                    "User-Agent": "campus-telegram-bots/0.0.0",
                },
            )

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=4),
        retry=retry_if_exception_type((httpx.TransportError, httpx.RemoteProtocolError)),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        path: str,
        *,
        telegram_id: int | None = None,
        bot_key: str | None = None,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        client = self._ensure()
        headers: dict[str, str] = {}
        if settings.laravel_internal_token:
            headers["Authorization"] = f"Bearer {settings.laravel_internal_token}"
        if telegram_id is not None:
            headers["X-Telegram-User-Id"] = str(telegram_id)
        if bot_key is not None:
            headers["X-Telegram-Bot-Key"] = bot_key

        resp = await client.request(method, path, json=json, params=params, headers=headers)
        if resp.status_code >= 400:
            try:
                body: dict[str, Any] | str = resp.json()
            except Exception:
                body = resp.text
            logger.error(
                "laravel_api.error",
                status=resp.status_code,
                method=method,
                path=path,
                body=body,
            )
            raise LaravelAPIError(resp.status_code, body)
        return resp.json() if resp.content else {}

    # ============ Convenience methods (extend as endpoints are added) ============

    async def link_telegram_user(
        self,
        *,
        bot_key: str,
        telegram_id: int,
        phone: str,
        full_name: str,
        username: str | None = None,
    ) -> dict[str, Any]:
        """Link a Telegram user to a CAMPUS user (creates tg_bot_users row).

        Server resolves CAMPUS user by phone (E.164) and creates the binding.
        Returns the linked user payload or 404 if no CAMPUS user with that phone.
        """
        return await self._request(
            "POST",
            f"/bots/{bot_key}/users/link",
            json={
                "telegram_id": telegram_id,
                "phone": phone,
                "full_name": full_name,
                "username": username,
            },
        )

    async def get_linked_user(self, *, bot_key: str, telegram_id: int) -> dict[str, Any] | None:
        try:
            return await self._request(
                "GET", f"/bots/{bot_key}/users/{telegram_id}"
            )
        except LaravelAPIError as e:
            if e.status == 404:
                return None
            raise

    async def log_command(
        self,
        *,
        bot_key: str,
        telegram_id: int,
        command: str,
        chat_type: str,
        latency_ms: int,
        ok: bool,
        error: str | None = None,
    ) -> None:
        """Fire-and-forget analytics for bot command usage."""
        try:
            await self._request(
                "POST",
                f"/bots/{bot_key}/commands/log",
                json={
                    "telegram_id": telegram_id,
                    "command": command,
                    "chat_type": chat_type,
                    "latency_ms": latency_ms,
                    "ok": ok,
                    "error": error,
                },
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("log_command.failed", error=str(e))


# Singleton
laravel = LaravelClient()
