"""Formatting helpers — currency, dates, percentages, names."""

from __future__ import annotations


def format_uzs(amount: int) -> str:
    """Format an integer amount as Uzbek so'm with space thousand separators."""
    return f"{amount:,} so'm".replace(",", " ")


def format_pct_bar(pct: int, *, width: int = 10) -> str:
    """ASCII progress bar for a 0-100 percentage, e.g. 80% → ▰▰▰▰▰▰▰▰▱▱."""
    pct = max(0, min(100, pct))
    filled = round(width * pct / 100)
    return "▰" * filled + "▱" * (width - filled)


def truncate(text: str, max_length: int, *, suffix: str = "…") -> str:
    """Truncate a string and append a suffix if it exceeds max_length."""
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)] + suffix
