"""Telegram WebApp helpers — initData parsing, HMAC verification.

The full verification logic lives on the Laravel side
(Modules/TelegramBots/Http/Controllers/WebAppAuthController), but the
bot may want to *generate* a signed deep-link for a one-tap WebApp open
OR validate locally for testing.
"""

from __future__ import annotations

import hashlib
import hmac
from urllib.parse import parse_qsl


def verify_init_data(init_data: str, bot_token: str) -> bool:
    """Mirror of Telegram's WebApp HMAC verification — local sanity check.

    Production verification is done by Laravel (single source of truth).
    """
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    incoming_hash = pairs.pop("hash", "")
    if not incoming_hash:
        return False
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, incoming_hash)
