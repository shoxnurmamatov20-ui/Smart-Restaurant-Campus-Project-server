"""Wrappers around the Laravel API for outbound notifications.

These do NOT send via aiogram — they ask Laravel to queue a
SendTelegramMessage job, which then loops back to /internal/send/<bot>.
Use this when a bot handler wants to schedule a separate outbound
message instead of replying inline.
"""

from __future__ import annotations

from typing import Any

from src.core.api_client import LaravelClient


async def queue_outbound_message(
    *,
    client: LaravelClient,
    bot_key: str,
    user_id: int,
    text: str,
    channel: str | None = None,
) -> dict[str, Any]:
    """Tell Laravel to send a Telegram message to a platform user (queued via Horizon)."""
    return await client._request(
        "POST",
        f"/bots/{bot_key}/notify",
        json={"user_id": user_id, "text": text, "channel": channel},
    )
