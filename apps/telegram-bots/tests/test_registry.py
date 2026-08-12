"""Validate the bot registry."""

from src.bots.registry import ALL_BOTS, BOTS_BY_KEY, PHASE_1_BOTS, total_count


def test_registry_has_at_least_50_bots() -> None:
    assert total_count() >= 50, "The platform ships 10 live + 40 planned bot definitions"


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
    assert BOTS_BY_KEY["guest"].name_uz == "Mehmon boti"


def test_guest_facing_bots_do_not_force_a_login() -> None:
    """A first-time visitor scanning a table QR has no account yet.

    Demanding a phone number before showing the menu loses that guest, so the
    entry-point bots must stay open.
    """
    for key in ("guest", "feedback"):
        assert not BOTS_BY_KEY[key].requires_login, f"{key} must work without a linked account"
        assert not BOTS_BY_KEY[key].requires_phone, f"{key} must not demand a phone up front"


def test_staff_bots_require_a_linked_account() -> None:
    """Anything that exposes revenue, tickets or guest data must be gated."""
    for key in ("waiter", "kitchen", "courier", "manager", "owner", "supplier"):
        assert BOTS_BY_KEY[key].requires_login, f"{key} must require a linked account"


def test_every_module_link_is_a_real_module() -> None:
    known = {
        "menu", "orders", "kitchen", "tables", "inventory",
        "suppliers", "staff", "finance", "crm", "analytics",
    }
    for b in ALL_BOTS:
        if b.module is not None:
            assert b.module in known, f"{b.key} points at unknown module {b.module!r}"
