# CAMPUS Telegram Bots (multi-bot dispatcher)

> **Single Python process, 10–50 Telegram bots.** Built on aiogram 3 + FastAPI + Redis FSM,
> all bots share one Laravel API client.

Architecture lives in [ADR-0006](../../docs/decisions/0006-telegram-multibot-architecture.md).

## Stack

- **Python** 3.13+
- **uv** package manager
- **aiogram** 3.15 (Telegram Bot framework, async, FSM, middleware, i18n)
- **FastAPI** (webhook host + admin REST + Prometheus metrics)
- **Redis** (FSM state, rate limit, dedup) — DB 3 (`apps/api` uses 0/1, `ai-services` uses 2)
- **HTTPX** + tenacity (Laravel API client with retries)
- **PostgreSQL** (read-only analytics — writes always via Laravel)

## Quick start (dev)

```bash
cd apps/telegram-bots
uv sync
cp .env.example .env
# Edit .env: set PUBLIC_WEBHOOK_URL (e.g. https://your-ngrok.ngrok.app)
# Get bot tokens from @BotFather, paste into BOT_TOKEN_STUDENT, etc.
uv run uvicorn src.main:app --reload --port 8002

# Expose to Telegram (one of):
#   ngrok http 8002
#   cloudflared tunnel --url http://localhost:8002
#   pinggy http 8002
# Then set PUBLIC_WEBHOOK_URL to the tunnel URL and restart.
```

In **production** (APP_DEBUG=false), webhooks are auto-registered on app startup.

In **dev** (APP_DEBUG=true), set webhooks manually:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-tunnel/tg/webhook/student" \
  -d "secret_token=<WEBHOOK_SECRET_TOKEN>"
```

Or use `uv run python -c 'from src.core.bot_manager import manager; import asyncio; asyncio.run(manager.set_webhooks())'`.

## URLs

| Path | Purpose |
|------|---------|
| `GET /` | service info |
| `GET /health` | liveness + bot counts |
| `GET /docs` | Swagger UI (dev only) |
| `GET /metrics` | Prometheus |
| `GET /bots` | catalog of all 50 bots (admin UI consumes this) |
| `POST /tg/webhook/{bot_key}` | Telegram webhook entrypoint |
| `POST /internal/send/{bot_key}` | outbound from Laravel queues |

## Folder structure

```
apps/telegram-bots/
├── src/
│   ├── main.py                  # FastAPI host
│   ├── core/
│   │   ├── config.py            # pydantic-settings
│   │   ├── logging.py           # structlog
│   │   ├── api_client.py        # Laravel HTTP client (Sanctum-authenticated)
│   │   └── bot_manager.py       # Multi-bot dispatcher manager
│   ├── bots/
│   │   ├── registry.py          # 50-bot catalog (single source of truth)
│   │   ├── _stub.py             # Fallback router for bots without dedicated handler
│   │   ├── student.py           # Talaba boti (full implementation)
│   │   ├── parent.py            # Ota-ona boti (full implementation)
│   │   └── ...                  # one file per implemented bot
│   ├── handlers/
│   │   └── onboarding.py        # Shared /start + phone verify flow
│   ├── middlewares/
│   │   ├── logging.py           # Structured per-update logging
│   │   ├── rate_limit.py        # Redis token bucket
│   │   ├── i18n.py              # Translator injection (uz/ru/en)
│   │   └── api_client.py        # Inject LaravelClient into handlers
│   ├── keyboards/               # Reusable Inline + Reply keyboards
│   ├── states/                  # FSM state classes
│   ├── filters/                 # Custom aiogram filters
│   ├── models/                  # Pydantic DTOs mirroring Laravel responses
│   └── utils/
├── tests/
│   ├── test_health.py
│   └── test_registry.py
├── pyproject.toml
├── uv.lock
├── .env.example
└── README.md
```

## Adding a new bot

```bash
# 1. Add a BotDefinition entry to src/bots/registry.py
# 2. (Optional) Create src/bots/<key>.py with `router = Router(...)`
# 3. Set BOT_TOKEN_<KEY> in .env
# 4. Restart — webhook auto-registers on startup (in prod) or call manager.set_webhooks()
```

If you skip step 2, the bot uses `src/bots/_stub.py` and replies "modul tez orada" to any input.

## Tests

```bash
uv run pytest -v               # 1.5s, no Telegram needed
uv run ruff check src/         # lint
uv run mypy src/               # strict types
```

## Outbound from Laravel

When Laravel needs to push a Telegram message (e.g., grade posted → notify student):

```php
// In Laravel
SendTelegramMessage::dispatch(
    botKey: 'student',
    telegramId: $user->telegram_id,
    text: "💯 Yangi baho: {$subject} — {$score}",
);
```

The job hits `POST http://telegram-bots:8002/internal/send/student` with the
shared `LARAVEL_INTERNAL_TOKEN`, and aiogram sends the message.

## Integration with Telegram WebApp

`apps/web` and `apps/admin` can be opened inside Telegram as **Mini Apps** —
the Next.js code is unchanged, but `window.Telegram.WebApp.initData` is sent
to `/api/v1/auth/telegram` for HMAC-verified one-click login.

See [docs/decisions/0006](../../docs/decisions/0006-telegram-multibot-architecture.md#telegram-webapp--mini-app)
for the full flow.

## Production deploy

- Dockerfile at `infrastructure/docker/telegram-bots.Dockerfile` (TODO)
- Single container, scale horizontally behind nginx (sticky sessions not needed — stateless)
- Health endpoint at `/health` for Kubernetes liveness/readiness
- Prometheus metrics at `/metrics`
- Sentry SDK auto-loaded if `SENTRY_DSN` is set
