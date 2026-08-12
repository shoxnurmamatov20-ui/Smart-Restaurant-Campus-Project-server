"""Smoke tests for the FastAPI host."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "restaurant-campus-telegram-bots"
    assert body["total_bots"] >= 50


@pytest.mark.asyncio
async def test_bot_list_includes_all_phase1() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/bots")
    assert response.status_code == 200
    bots = response.json()
    keys = {b["key"] for b in bots}
    # All 10 Phase-1 bots must be present
    for required in [
        "guest", "waiter", "kitchen", "courier", "manager",
        "owner", "loyalty", "reservation", "feedback", "supplier",
    ]:
        assert required in keys, f"Phase-1 bot {required!r} missing from registry"


@pytest.mark.asyncio
async def test_webhook_rejects_bad_secret() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/tg/webhook/guest",
            headers={"X-Telegram-Bot-Api-Secret-Token": "WRONG_SECRET"},
            json={"update_id": 1},
        )
    # Should be 401 (bad secret) or 503 (no token configured for the guest bot in tests)
    assert response.status_code in (401, 503)


@pytest.mark.asyncio
async def test_webhook_rejects_unknown_bot() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/tg/webhook/this_bot_does_not_exist",
            headers={"X-Telegram-Bot-Api-Secret-Token": "any"},
            json={"update_id": 1},
        )
    assert response.status_code == 404
