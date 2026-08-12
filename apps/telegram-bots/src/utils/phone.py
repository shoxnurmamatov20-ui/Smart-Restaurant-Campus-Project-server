"""Phone number helpers — E.164 normalization for Uzbekistan."""

from __future__ import annotations

import phonenumbers


def normalize_e164(raw: str, *, default_region: str = "UZ") -> str:
    """Convert a phone string to E.164 (e.g. '+998901234567').

    Two shapes arrive in practice and both have to work:

    * a **national** number the guest typed by hand — ``901234567``. It must be
      parsed against ``default_region`` so the country code is added.
    * an **international** number Telegram hands back from a shared contact,
      usually without the plus — ``998901234567``.

    Prefixing everything with ``+`` up front breaks the first case (``901234567``
    would become the nonsense ``+901234567``), so try the string as-is first and
    only then with a plus. Unparseable input is returned in ``+`` form rather
    than raising, because a bad phone must never take a bot handler down.
    """
    cleaned = "".join(ch for ch in raw.strip() if ch.isdigit() or ch == "+")
    if not cleaned:
        return raw.strip()

    candidates = [cleaned]
    if not cleaned.startswith("+"):
        candidates.append(f"+{cleaned}")

    for candidate in candidates:
        try:
            parsed = phonenumbers.parse(candidate, default_region)
        except phonenumbers.NumberParseException:
            continue
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)

    return cleaned if cleaned.startswith("+") else f"+{cleaned}"


def mask_phone(e164: str) -> str:
    """Mask a phone for logs/UI: +998901234567 → +998 90 *** ** 67.

    The country code is taken from the parsed number rather than assumed to be
    three digits, so a Russian (+7) or Kazakh number masks correctly too.
    """
    if len(e164) < 7:
        return e164

    try:
        parsed = phonenumbers.parse(e164, None)
        country_code = f"+{parsed.country_code}"
        national = str(parsed.national_number)
    except phonenumbers.NumberParseException:
        country_code, national = e164[:4], e164[4:]

    if len(national) < 4:
        return e164

    return f"{country_code} {national[:2]} *** ** {national[-2:]}"
