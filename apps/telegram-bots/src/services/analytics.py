"""Analytics helpers — push command-usage metrics to Laravel."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from src.core.api_client import LaravelClient


@asynccontextmanager
async def track_command(
    *,
    client: LaravelClient,
    bot_key: str,
    telegram_id: int,
    command: str,
    chat_type: str = "private",
) -> AsyncIterator[None]:
    """Context manager that logs command latency + ok/error to Laravel.

    Usage:
        async with track_command(client=laravel, bot_key="waiter",
                                 telegram_id=user.id, command="/tables"):
            await do_work()
    """
    started = time.perf_counter()
    error: str | None = None
    try:
        yield
    except Exception as e:  # noqa: BLE001
        error = str(e)
        raise
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            await client.log_command(
                bot_key=bot_key,
                telegram_id=telegram_id,
                command=command,
                chat_type=chat_type,
                latency_ms=latency_ms,
                ok=error is None,
                error=error,
            )
        except Exception:
            pass
