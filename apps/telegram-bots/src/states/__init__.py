"""FSM state classes for multi-step flows."""

from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class OnboardingStates(StatesGroup):
    """User /start flow: share phone -> link CAMPUS user."""

    waiting_for_phone = State()
    linking = State()
    done = State()
