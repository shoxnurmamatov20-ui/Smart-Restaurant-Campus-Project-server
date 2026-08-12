# Phase-1 bot handlers

The first 10 bots that ship in Phase 1. Place each bot's `Router` in `<key>.py`.

## Active keys

| Key           | Audience    | Module link | Status                               |
| ------------- | ----------- | ----------- | ------------------------------------ |
| `guest`       | Mehmon      | `menu`      | 🟢 implemented (at `bots/guest.py`)  |
| `waiter`      | Ofitsiant   | `orders`    | 🟢 implemented (at `bots/waiter.py`) |
| `kitchen`     | Oshpaz      | `kitchen`   | ⏳ stub                              |
| `courier`     | Kuryer      | `orders`    | ⏳ stub                              |
| `manager`     | Menejer     | `analytics` | ⏳ stub                              |
| `owner`       | Egasi       | `analytics` | ⏳ stub                              |
| `loyalty`     | Mehmon      | `crm`       | ⏳ stub                              |
| `reservation` | Mehmon      | `tables`    | ⏳ stub                              |
| `feedback`    | Mehmon      | `crm`       | ⏳ stub                              |
| `supplier`    | Yetkazuvchi | `suppliers` | ⏳ stub                              |

## Adding a new Phase-1 bot

1. Add/verify a `BotDefinition` in `src/bots/registry.py` with `phase=BotPhase.PHASE_1`.
2. Create `src/bots/phase1/<key>.py` exporting `router = Router(name=f"bot:{KEY}")`.
3. Use `from src.bots._base import build_base_router` to inherit `/help` + `/cancel`.
4. Set `BOT_TOKEN_<KEY>` in `apps/telegram-bots/.env` (from @BotFather).
5. Restart the dispatcher — `bot_manager._load_router` finds the file automatically.

## Where shared things live

- `src/keyboards/<key>.py` — per-bot keyboards
- `src/states/<flow>.py` — per-flow FSM groups
- `src/models/dto.py` — Pydantic DTOs mirroring Laravel response shapes
- `src/handlers/onboarding.py` — reusable `/start` + phone verification
- `src/filters/role.py` — role-based handler gates
