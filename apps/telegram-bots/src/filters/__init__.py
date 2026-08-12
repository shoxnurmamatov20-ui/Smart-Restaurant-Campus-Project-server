"""Custom aiogram filters — role-based, linked-user, feature-flag.

Re-exports:
- HasRole / IsKitchen / IsWaiter / ...      from filters.role
- IsLinked                                  from filters.linked
"""

from src.filters.linked import IsLinked
from src.filters.role import (
    HasRole,
    IsAccountant,
    IsAdmin,
    IsCashier,
    IsChef,
    IsCourier,
    IsGuest,
    IsKitchen,
    IsManager,
    IsOwner,
    IsStaff,
    IsStorekeeper,
    IsWaiter,
)

__all__ = [
    "HasRole",
    "IsAccountant",
    "IsAdmin",
    "IsCashier",
    "IsChef",
    "IsCourier",
    "IsGuest",
    "IsKitchen",
    "IsLinked",
    "IsManager",
    "IsOwner",
    "IsStaff",
    "IsStorekeeper",
    "IsWaiter",
]
