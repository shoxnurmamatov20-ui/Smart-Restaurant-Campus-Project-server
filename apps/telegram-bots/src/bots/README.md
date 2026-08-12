# Bot handlers

One dispatcher, **50 bots**: 10 that a restaurant needs from day one, 40 planned.

## Layout

```
bots/
├── registry.py       # single source of truth — every BotDefinition
├── _base.py          # build_base_router(): /help + /cancel for free
├── _stub.py          # "tez orada" fallback for bots with no handler yet
├── guest.py          # Phase 1 — implemented
├── waiter.py         # Phase 1 — implemented
├── phase1/           # remaining Phase-1 handlers
├── phase2/           # Phase-2 specialised bots
├── ai/               # LLM-backed (menu_ai)
├── branch/           # per-venue internal channels (br_*)
└── concept/          # per-concept + franchise/audit
```

## Phase 1 — the ten that matter

| Key           | Bot                    | Audience    |
| ------------- | ---------------------- | ----------- |
| `guest`       | Mehmon boti            | Mehmon      |
| `waiter`      | Ofitsiant boti         | Ofitsiant   |
| `kitchen`     | Oshxona boti           | Oshpaz      |
| `courier`     | Kuryer boti            | Kuryer      |
| `manager`     | Filial menejeri boti   | Menejer     |
| `owner`       | Egasi boti             | Egasi       |
| `loyalty`     | Sodiqlik boti          | Mehmon      |
| `reservation` | Bron boti              | Mehmon      |
| `feedback`    | Fikr-mulohaza boti     | Mehmon      |
| `supplier`    | Yetkazib beruvchi boti | Yetkazuvchi |

## Adding a bot

1. Append a `BotDefinition` to `registry.py`.
2. Create `<key>.py` in the right folder exporting a module-level `router`.
3. Set `BOT_TOKEN_<KEY>` in `.env`.
4. Restart — the webhook registers itself on startup.

A bot with a token but no handler file falls back to `_stub.py`, so nothing
crashes while the handler is still being written.

## Rules

- **Guest-facing bots must work without a login.** Somebody scanning the QR code
  on a table has no account; asking for a phone number before showing the menu
  loses them.
- **Staff bots must verify the branch**, not just the role — a cook in Sergeli
  should never receive Chilonzor's tickets.
- Never call the database directly. Everything goes through the Laravel API
  (`src/core/api_client.py`), which is the only component that knows which
  restaurant a chat belongs to.
