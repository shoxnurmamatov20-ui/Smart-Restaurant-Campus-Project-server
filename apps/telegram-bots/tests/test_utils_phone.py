"""Tests for phone number utilities."""

from __future__ import annotations

import pytest

from src.utils.phone import mask_phone, normalize_e164


class TestNormalizeE164:
    def test_already_e164_passes_through(self) -> None:
        assert normalize_e164("+998901234567") == "+998901234567"

    def test_without_plus_gets_normalized(self) -> None:
        assert normalize_e164("998901234567") == "+998901234567"

    def test_local_uz_format(self) -> None:
        # 9-digit national number for Uzbekistan
        assert normalize_e164("901234567") == "+998901234567"

    def test_invalid_string_returned_as_is(self) -> None:
        # Garbage in, garbage out — but unchanged, not decorated. Gluing a "+"
        # onto non-numeric text produced a value that looked like a phone number
        # to every downstream reader while being nothing of the sort.
        result = normalize_e164("not-a-phone")
        assert result == "not-a-phone"

    def test_other_region(self) -> None:
        # Russian number with explicit region
        result = normalize_e164("9991234567", default_region="RU")
        assert result.startswith("+7")


class TestMaskPhone:
    def test_masks_uzbek_number(self) -> None:
        assert mask_phone("+998901234567") == "+998 90 *** ** 67"

    def test_short_string_unchanged(self) -> None:
        assert mask_phone("+998") == "+998"

    def test_preserves_last_two_digits(self) -> None:
        masked = mask_phone("+998901234599")
        assert masked.endswith("99")
        assert "*" in masked


@pytest.mark.parametrize(
    "raw, expected_prefix",
    [
        ("+998901234567", "+998"),
        ("998901234567", "+998"),
        ("901234567", "+998"),
    ],
)
def test_normalize_yields_uz_prefix(raw: str, expected_prefix: str) -> None:
    assert normalize_e164(raw).startswith(expected_prefix)
