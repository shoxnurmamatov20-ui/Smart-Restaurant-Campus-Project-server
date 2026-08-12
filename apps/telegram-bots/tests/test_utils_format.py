"""Tests for formatting utilities."""

from __future__ import annotations

from src.utils.format import format_pct_bar, format_uzs, truncate


class TestFormatUzs:
    def test_thousands_use_spaces(self) -> None:
        assert format_uzs(1_500_000) == "1 500 000 so'm"

    def test_zero(self) -> None:
        assert format_uzs(0) == "0 so'm"

    def test_negative(self) -> None:
        # Negative amounts (refunds) — locale-friendly formatting still works
        assert format_uzs(-50_000) == "-50 000 so'm"


class TestFormatPctBar:
    def test_zero_pct(self) -> None:
        assert format_pct_bar(0) == "▱" * 10

    def test_full_pct(self) -> None:
        assert format_pct_bar(100) == "▰" * 10

    def test_half_pct(self) -> None:
        bar = format_pct_bar(50)
        assert bar.count("▰") == 5
        assert bar.count("▱") == 5

    def test_clamps_negative(self) -> None:
        assert format_pct_bar(-10) == "▱" * 10

    def test_clamps_overflow(self) -> None:
        assert format_pct_bar(150) == "▰" * 10

    def test_custom_width(self) -> None:
        bar = format_pct_bar(50, width=20)
        assert len(bar) == 20


class TestTruncate:
    def test_short_string_unchanged(self) -> None:
        assert truncate("hello", 10) == "hello"

    def test_long_string_truncated(self) -> None:
        assert truncate("Hello world!", 8) == "Hello w…"

    def test_custom_suffix(self) -> None:
        assert truncate("Hello world!", 8, suffix="...") == "Hello...".replace("Hello", "Hello")
        # Test the actual behavior
        result = truncate("abcdefghij", 5, suffix="...")
        assert len(result) == 5
        assert result.endswith("...")
