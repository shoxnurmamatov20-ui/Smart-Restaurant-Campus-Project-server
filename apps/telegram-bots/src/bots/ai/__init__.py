"""LLM-backed bot handler modules.

Files here are auto-discovered by `bot_manager._load_router` via
`src.bots.ai.<bot_key>` lookup.

Active key: `menu_ai` — recommends dishes from the live menu based on what the
guest says they feel like eating, their allergies and their order history.

Depends on the `apps/ai-services` Python service for inference.
"""
