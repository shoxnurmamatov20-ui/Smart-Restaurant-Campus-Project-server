"""FSM states for the shared /start phone-verification flow.

Used by handlers/onboarding.py and reused by every bot that needs to link a
Telegram user to a platform account.
"""

from aiogram.fsm.state import State, StatesGroup


class OnboardingStates(StatesGroup):
    """Linear state machine: idle → waiting_for_phone → linking → done."""

    waiting_for_phone = State()
    linking = State()
    done = State()
