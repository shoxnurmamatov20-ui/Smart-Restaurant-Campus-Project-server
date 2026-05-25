# ADR-0006: Telegram multi-bot subsystem architecture

**Status:** accepted
**Date:** 2026-05-25
**Decision makers:** Project owner

## Context

CAMPUS Phase 1+ targets **10–50 Telegram bots** that integrate with the web platform. Each bot serves a specific audience (talaba, ota-ona, o'qituvchi, kantin oshpazi, kutubxonachi, transport haydovchisi, va h.k.) or a specific module workflow. All bots share:

- One canonical user/identity store (Laravel `users` + `roles`)
- One real-time event bus (Laravel Reverb broadcasts)
- One push notification fabric (queued via Laravel Horizon)
- One file store (MinIO)
- One language matrix (uz / ru / en + future qoraqalpoq)

Three architectural options were considered:

1. **50 separate Node.js / Python processes**, each its own deploy unit, polling Telegram independently.
2. **PHP-only via Botman/Nutgram** inside Laravel — keeps stack monoglot.
3. **One Python "multi-bot dispatcher"** process running aiogram 3, exposing a single FastAPI app with per-bot webhook routes, calling Laravel API for business logic.

## Decision

**Option 3** — single Python process running **aiogram 3.x multi-bot dispatcher** behind a **FastAPI** webhook host.

- Lives in `apps/telegram-bots/` parallel to `apps/ai-services/` (also Python + FastAPI + uv)
- Each bot has its own token, but they share a single dispatcher, Redis-backed FSM, and HTTPX client to Laravel
- Webhook URL pattern: `https://campus.uz/tg/webhook/{bot_key}/{secret_token}`
- Bots are registered in a config file (`src/bots/registry.py`) — adding a new bot is a YAML/Python entry + a handler file
- Bot business logic NEVER queries the database directly — it ALWAYS calls the Laravel API with a bot-scoped Sanctum personal access token (`/api/v1/bots/{bot_key}/...`)

## Consequences

**+:**

- **Single process, single deploy.** 50 bots in one container with shared HTTP keep-alive pool to Laravel.
- **aiogram 3** has best-in-class FSM, middleware, filter, i18n support — production proven on >1M users (e.g., @JoinUkraineBot).
- **FastAPI host** gives us free Prometheus metrics, OpenAPI docs, health endpoint, structured logging — mirrors the AI Services app.
- **Laravel is the source of truth** — no schema drift between web UI and bot UI. Bot is a presentation layer, not a parallel app.
- **One bot can be promoted to its own process** later if it grows huge (just split out the config and point a different webhook URL).
- **WebApp integration** — apps/web and apps/admin can be served inside Telegram as Mini Apps using the same Next.js code, no fork needed.

**−:**

- Adds Python to the request-path stack alongside Laravel. We already have Python for AI Services so this is no incremental complexity.
- Single process = single failure point. Mitigated by Kubernetes replicas in production and stateless design (FSM in Redis).
- Aiogram 3 multi-bot is well supported but less common than single-bot mode — documentation requires some hunting.

## Alternatives rejected

| Variant | Why no |
|---------|--------|
| 50 separate processes | Operationally crazy. Per-bot CI, per-bot deploy, per-bot logs, per-bot env. |
| Botman/Nutgram (PHP) | PHP webhook handling is slower; Laravel request lifecycle is heavy for tiny bot messages. aiogram FSM + middleware ecosystem is years ahead. |
| Node.js (grammY) | Equally capable but we already have Python infrastructure (AI Services). Reuse the toolchain. |
| n8n / Zapier workflows | Locks us into a no-code tool. Doesn't scale to module-specific complex logic. |

## Module-by-module bot plan

10 immediate bots (Phase 1):

1. `student_bot` — talaba: jadval, baholar, davomat, kantin balansi, kutubxona
2. `parent_bot` — ota-ona: farzand holati, kelish-ketish, baholar, to'lovlar
3. `teacher_bot` — o'qituvchi: dars jadvali, davomat olish, baho qo'yish, KPI
4. `hr_bot` — xodim: Face ID kelish/ketish, ta'til so'rovi, payslip
5. `library_bot` — kitob band qilish, qaytarish eslatma, qidiruv
6. `cafeteria_bot` — kunlik menyu, balans, oldindan buyurtma
7. `transport_bot` — shuttle bus jadvali, real-time GPS, ota-ona uchun
8. `helpdesk_bot` — IT/akademik ticket ochish, javob olish
9. `edms_bot` — hujjat aylanishi: tasdiqlash kutilayotganlar
10. `rector_bot` — rektor uchun KPI dashboard, kritik xabarnomalar

40 future bots (Phase 2+): smart-classroom controller, exam proctor notifier, alumni network, anonymous tip line, dormitory complaints, parking, security incident report, sports clubs, library new arrivals, scholarship results, research grants, conference reminders, BMI deadlines, internship matching, career fairs, masterclasses, mental health checks, emergency alerts, weather/transport disruption, language-pair chat, classroom-specific group bots, fakultet bots (×8), per-kafedra bots (×16) — totalling 50.

## Storage shape (Laravel side)

New `Modules/TelegramBots/` (nwidart) with migrations:

- `tg_bots` — registered bots: key, name, type, encrypted token, webhook secret, status
- `tg_bot_users` — telegram_id ↔ user_id mapping, per bot (composite unique)
- `tg_subscriptions` — opt-in channels per user (notification preferences)
- `tg_messages` — outbound message log (audit + retry)
- `tg_command_logs` — analytics: which command, who, when, latency

## Outbound notification flow (Laravel → Telegram)

```
[Laravel module] → dispatch(SendTelegramMessage::class)
                  → Redis queue (Horizon)
                  → HTTP POST to Python: /internal/send/{bot_key}
                  → Python aiogram.send_message(chat_id, text, kb)
                  → Telegram API
```

Python service exposes `/internal/send/{bot_key}` (auth: shared secret in `LARAVEL_INTERNAL_TOKEN`).

## Telegram WebApp / Mini App

apps/web and apps/admin can be embedded as Telegram WebApps:

- WebApp button in bot → opens https://campus.uz/tg-app/{module}?tgWebApp=true
- Next.js detects `?tgWebApp=true` → reads `window.Telegram.WebApp.initData`
- Sends initData to `/api/v1/auth/telegram` → Laravel validates HMAC → issues Sanctum cookie
- User is now logged in as their Telegram-linked CAMPUS user, no separate password

This means we get **rich UIs inside Telegram for free** — no native Telegram menu can match a Next.js component, but a WebApp can.
