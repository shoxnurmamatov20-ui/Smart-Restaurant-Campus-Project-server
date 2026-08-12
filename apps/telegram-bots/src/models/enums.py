"""Enums mirroring values from the Laravel side (roles, statuses, order flow)."""

from __future__ import annotations

from enum import Enum


class UserRole(str, Enum):
    """All 15 roles seeded by RolesAndPermissionsSeeder.php."""

    SUPER_ADMIN = "super-admin"
    OWNER = "owner"
    BRAND_MANAGER = "brand-manager"
    BRANCH_MANAGER = "branch-manager"
    CHEF = "chef"
    COOK = "cook"
    WAITER = "waiter"
    BARTENDER = "bartender"
    CASHIER = "cashier"
    HOST = "host"
    COURIER = "courier"
    STOREKEEPER = "storekeeper"
    ACCOUNTANT = "accountant"
    MARKETER = "marketer"
    GUEST = "guest"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class OrderChannel(str, Enum):
    """Where an order came from — mirrors MenuItem::CHANNELS."""

    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"
    AGGREGATOR = "aggregator"


class OrderStatus(str, Enum):
    """The life of an order, in the order it actually happens."""

    DRAFT = "draft"
    PLACED = "placed"
    IN_KITCHEN = "in_kitchen"
    READY = "ready"
    SERVED = "served"
    ON_THE_WAY = "on_the_way"
    DELIVERED = "delivered"
    PAID = "paid"
    CANCELLED = "cancelled"


class KitchenStation(str, Enum):
    HOT = "hot"
    COLD = "cold"
    GRILL = "grill"
    BAR = "bar"
    PASTRY = "pastry"


class TableStatus(str, Enum):
    FREE = "free"
    OCCUPIED = "occupied"
    RESERVED = "reserved"
    CLEANING = "cleaning"
