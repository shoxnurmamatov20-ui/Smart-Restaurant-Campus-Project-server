"""All bot handler modules + registry live here. New bot = new file + registry entry.

Layout (auto-discovered by `bot_manager._load_router`):

  bots/
  ├── registry.py          — single source of truth (50 BotDefinition entries)
  ├── _base.py             — `build_base_router(definition)` w/ /help, /cancel
  ├── _stub.py             — fallback router for bots without a handler file
  ├── guest.py             — Phase-1 implemented (flat)
  ├── waiter.py            — Phase-1 implemented (flat)
  ├── phase1/<key>.py      — Phase-1 bot handlers (preferred for new bots)
  ├── phase2/<key>.py      — Phase-2 specialized bots
  ├── ai/<key>.py          — LLM-backed bots (menu_ai)
  ├── branch/<key>.py      — Per-branch internal channels (br_*)
  └── concept/<key>.py     — Per-concept / franchise bots (concept_*, franchise, audit)

The manager tries `src.bots.<key>` first (flat), then the phase/branch/concept
folder implied by the BotDefinition. Drop a `<key>.py` into any of those folders
and it auto-loads on the next restart — no manager change needed.
"""
