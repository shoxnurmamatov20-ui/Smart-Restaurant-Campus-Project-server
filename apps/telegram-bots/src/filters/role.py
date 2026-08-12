"""Role-based filters — short-circuit handlers based on the linked user's role.

The auth middleware MUST be active (it sets data["app_user"]) — otherwise all
role filters return False and handlers are silently skipped.
"""

from __future__ import annotations

from typing import Any

from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject


class HasRole(BaseFilter):
    """Match only if data["app_user"] is set AND has one of the given roles."""

    def __init__(self, *roles: str) -> None:
        self.roles: set[str] = set(roles)

    async def __call__(self, event: TelegramObject, **data: Any) -> bool:
        app_user = data.get("app_user")
        if not app_user:
            return False
        user_roles = set(app_user.get("roles", []) if isinstance(app_user, dict) else [])
        if not self.roles:
            return bool(user_roles)
        return bool(user_roles & self.roles)


# Kitchen brigade
IsKitchen = HasRole("cook", "chef", "bartender")
IsChef = HasRole("chef", "branch-manager", "owner", "super-admin")

# Floor
IsWaiter = HasRole("waiter", "host")
IsCashier = HasRole("cashier")
IsCourier = HasRole("courier")

# Back office
IsStorekeeper = HasRole("storekeeper", "chef", "branch-manager")
IsAccountant = HasRole("accountant", "owner", "super-admin")
IsManager = HasRole("branch-manager", "brand-manager", "owner", "super-admin")
IsOwner = HasRole("owner", "super-admin")
IsAdmin = HasRole("super-admin")

# Anyone who works here (as opposed to a guest)
IsStaff = HasRole(
    "chef", "cook", "waiter", "bartender", "cashier", "host", "courier",
    "storekeeper", "accountant", "marketer", "branch-manager", "brand-manager",
    "owner", "super-admin",
)
IsGuest = HasRole("guest")
