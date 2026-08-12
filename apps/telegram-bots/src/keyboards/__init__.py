"""Telegram keyboards — reusable Reply + Inline + WebApp builders.

Per-bot keyboards live in `keyboards/<bot_key>.py` (e.g. guest.py, waiter.py).
Shared keyboards (phone request, cancel, back) live in `keyboards/common.py`.

When adding a new bot:
  1. Create `keyboards/<bot_key>.py` exporting `<bot_key>_main_menu(i18n)` and
     any flow-specific keyboards.
  2. Re-export the public functions here.
"""

from src.keyboards.common import back_button, cancel_button, remove, request_phone
from src.keyboards.guest import guest_main_menu, rating_keyboard
from src.keyboards.waiter import order_actions, waiter_main_menu

__all__ = [
    "back_button",
    "cancel_button",
    "guest_main_menu",
    "order_actions",
    "rating_keyboard",
    "remove",
    "request_phone",
    "waiter_main_menu",
]
