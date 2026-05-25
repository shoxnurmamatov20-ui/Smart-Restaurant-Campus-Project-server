"""Validate the bot registry."""

from src.bots.registry import ALL_BOTS, BOTS_BY_KEY, PHASE_1_BOTS, total_count


def test_registry_has_at_least_50_bots() -> None:
    assert total_count() >= 50, "User asked for 10–50 bots; we should ship at least 50 definitions"


def test_phase1_has_exactly_10() -> None:
    assert len(PHASE_1_BOTS) == 10


def test_all_keys_unique() -> None:
    keys = [b.key for b in ALL_BOTS]
    assert len(keys) == len(set(keys)), f"Duplicate bot keys: {[k for k in keys if keys.count(k) > 1]}"


def test_all_keys_lowercase_snake() -> None:
    for b in ALL_BOTS:
        assert b.key.islower(), f"{b.key} must be lowercase"
        assert " " not in b.key
        assert "-" not in b.key, f"{b.key} should use underscores (env-var-safe)"


def test_env_var_format() -> None:
    for b in ALL_BOTS:
        assert b.env_var.startswith("BOT_TOKEN_")
        assert b.env_var.isupper() or "_" in b.env_var


def test_lookup_works() -> None:
    assert BOTS_BY_KEY["student"].name_uz == "Talaba boti"
