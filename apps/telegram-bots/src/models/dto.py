"""Pydantic DTOs — mirror the shapes returned by Laravel /api/v1/bots/*.

Keep these in sync with
`apps/api/Modules/TelegramBots/app/Http/Controllers/BotApiController.php`.
Adding a new endpoint? Add a DTO here so handlers can validate + autocomplete.

Money convention: every `*_tiyin` field is an integer in tiyin
(1 UZS = 100 tiyin), exactly as the API stores it. Format only at render time.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from src.models.enums import (
    KitchenStation,
    OrderChannel,
    OrderStatus,
    TableStatus,
    UserRole,
)


# ============ Shared identity ============

class PlatformUser(BaseModel):
    """A staff member or guest account on the platform."""

    id: int
    full_name: str
    email: str | None = None
    phone: str | None = None
    roles: list[UserRole] = Field(default_factory=list)
    tenant_slug: str | None = None
    branch_code: str | None = None


class LinkedUserResponse(BaseModel):
    bot_user_id: int
    user: PlatformUser


# ============ Menu (guest bot) ============

class MenuItemBrief(BaseModel):
    id: int
    sku: str
    title: str
    price_tiyin: int
    station: KitchenStation = KitchenStation.HOT
    is_orderable: bool = True
    allergens: list[str] = Field(default_factory=list)


class MenuCategoryBrief(BaseModel):
    id: int
    slug: str
    title: str
    items: list[MenuItemBrief] = Field(default_factory=list)


class MenuResponse(BaseModel):
    channel: OrderChannel = OrderChannel.DINE_IN
    categories: list[MenuCategoryBrief] = Field(default_factory=list)


# ============ Orders ============

class OrderLine(BaseModel):
    menu_item_id: int
    title: str
    quantity: int
    price_tiyin: int
    note: str | None = None


class OrderBrief(BaseModel):
    id: int
    number: str
    channel: OrderChannel
    status: OrderStatus
    table_label: str | None = None
    total_tiyin: int
    placed_at: str | None = None
    lines: list[OrderLine] = Field(default_factory=list)


class OrdersResponse(BaseModel):
    orders: list[OrderBrief] = Field(default_factory=list)


# ============ Kitchen (KDS) ============

class KitchenTicket(BaseModel):
    id: int
    order_number: str
    station: KitchenStation
    table_label: str | None = None
    items: list[OrderLine] = Field(default_factory=list)
    elapsed_minutes: int = 0
    is_late: bool = False


class KitchenTicketsResponse(BaseModel):
    tickets: list[KitchenTicket] = Field(default_factory=list)


# ============ Tables & reservations ============

class TableBrief(BaseModel):
    id: int
    label: str
    hall: str | None = None
    seats: int = 0
    status: TableStatus = TableStatus.FREE


class TablesResponse(BaseModel):
    tables: list[TableBrief] = Field(default_factory=list)


class ReservationBrief(BaseModel):
    id: int
    table_label: str
    guest_name: str
    guests_count: int
    starts_at: str
    status: str


class ReservationsResponse(BaseModel):
    reservations: list[ReservationBrief] = Field(default_factory=list)


# ============ Loyalty (guest bot) ============

class LoyaltyBalance(BaseModel):
    points: int = 0
    tier: str = "bronze"
    cashback_tiyin: int = 0
    next_tier_points: int | None = None


class PromoOffer(BaseModel):
    code: str
    title: str
    discount_percent: int | None = None
    valid_until: str | None = None


class PromoOffersResponse(BaseModel):
    offers: list[PromoOffer] = Field(default_factory=list)


# ============ Shift / revenue (manager & owner bots) ============

class ShiftSummary(BaseModel):
    is_open: bool = False
    opened_at: str | None = None
    revenue_tiyin: int = 0
    orders_count: int = 0
    average_cheque_tiyin: int = 0
    guests_count: int = 0


class BranchRevenue(BaseModel):
    branch_code: str
    branch_name: str
    revenue_tiyin: int
    orders_count: int


class BranchRevenueResponse(BaseModel):
    branches: list[BranchRevenue] = Field(default_factory=list)


# ============ Courier ============

class DeliveryTask(BaseModel):
    order_id: int
    order_number: str
    address: str
    distance_km: float | None = None
    payment_method: str
    total_tiyin: int
    customer_phone: str | None = None


class DeliveryTasksResponse(BaseModel):
    tasks: list[DeliveryTask] = Field(default_factory=list)


# ============ Supplier ============

class PurchaseOrderBrief(BaseModel):
    id: int
    number: str
    status: str
    expected_at: str | None = None
    total_tiyin: int


class PurchaseOrdersResponse(BaseModel):
    purchase_orders: list[PurchaseOrderBrief] = Field(default_factory=list)


# ============ Outbound notification (Laravel-side) ============

class OutboundMessagePayload(BaseModel):
    chat_id: int
    text: str
    parse_mode: str = "HTML"
    reply_markup: dict | None = None
    disable_web_page_preview: bool = True
