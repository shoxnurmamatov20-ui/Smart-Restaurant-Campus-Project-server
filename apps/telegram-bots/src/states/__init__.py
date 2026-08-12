"""FSM state groups for aiogram conversations.

Per-flow state groups live in their own file (`states/<flow>.py`).
Re-export the public groups here so handlers can use them directly.

When adding a new multi-step flow:
  1. Create `states/<flow>.py` with a StatesGroup subclass.
  2. Re-export it here for convenience.
"""

from src.states.onboarding import OnboardingStates

__all__ = ["OnboardingStates"]
