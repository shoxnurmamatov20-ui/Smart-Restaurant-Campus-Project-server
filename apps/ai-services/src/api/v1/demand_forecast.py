"""Demand forecast — talab bashorati (Analytics moduli, Phase 2).

Tomorrow's prep list is the single most expensive guess a restaurant makes
every day: over-prep and it goes in the bin, under-prep and the stop-list
starts at 19:00. This endpoint turns that guess into a number.
"""

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class DemandFeatures(BaseModel):
    """What the Laravel side knows about a branch and a horizon."""

    branch_code: str
    target_date: date
    weekday: int = Field(ge=0, le=6, description="0 = Monday")
    is_holiday: bool = False
    weather_temp_c: float | None = None
    weather_condition: str | None = None  # clear | rain | snow | ...
    has_promotion: bool = False
    # Recent history, oldest first — daily order counts and revenue in tiyin.
    history_orders: list[int] = Field(default_factory=list)
    history_revenue_tiyin: list[int] = Field(default_factory=list)


class ItemForecast(BaseModel):
    menu_item_id: int
    sku: str
    expected_quantity: float
    confidence: float = Field(ge=0, le=1)


class DemandForecast(BaseModel):
    branch_code: str
    target_date: date
    expected_orders: int
    expected_revenue_tiyin: int
    expected_guests: int
    peak_hours: list[int] = Field(default_factory=list, description="Local hours, e.g. [13, 19, 20]")
    items: list[ItemForecast] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
    notes: list[str] = Field(default_factory=list)


@router.post("/predict", response_model=DemandForecast)
async def predict_demand(features: DemandFeatures) -> DemandForecast:
    """Forecast tomorrow's demand for a branch, down to per-dish quantities."""
    # TODO: implement
    # 1. Load the trained model (Prophet / LightGBM) from models_data/
    # 2. Feature engineering: weekday, holiday calendar, weather, promo flag,
    #    lagged sales, rolling means, payday effects
    # 3. Predict order count and revenue, then split across dishes using the
    #    recent mix (ABC analysis from the Analytics module)
    # 4. Return per-item quantities so the purchase order writes itself
    return DemandForecast(
        branch_code=features.branch_code,
        target_date=features.target_date,
        expected_orders=0,
        expected_revenue_tiyin=0,
        expected_guests=0,
        peak_hours=[],
        items=[],
        confidence=0.0,
        notes=["Model hali o'qitilmagan — tarixiy ma'lumot to'planmoqda."],
    )


class PrepListRequest(BaseModel):
    branch_code: str
    target_date: date


class PrepItem(BaseModel):
    ingredient_id: int
    name: str
    quantity: float
    unit: str


class PrepList(BaseModel):
    branch_code: str
    target_date: date
    items: list[PrepItem] = Field(default_factory=list)


@router.post("/prep-list", response_model=PrepList)
async def prep_list(request: PrepListRequest) -> PrepList:
    """Turn a demand forecast into an ingredient prep list via the tech cards."""
    # TODO: multiply the per-dish forecast by each dish's recipe (Inventory
    # module) and subtract what is already in stock.
    return PrepList(
        branch_code=request.branch_code,
        target_date=request.target_date,
        items=[],
    )
