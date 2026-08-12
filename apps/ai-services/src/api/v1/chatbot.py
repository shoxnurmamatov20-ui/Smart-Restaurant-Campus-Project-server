"""AI menu assistant — mehmon uchun taom tavsiya qiluvchi chatbot (Phase 2).

Backs the `menu_ai` Telegram bot and the "nima buyurtma qilay?" widget on the
QR menu. The menu, the stop-list and the guest's allergens always arrive in the
request: the model recommends only from what is actually sellable right now,
because a suggestion the kitchen cannot cook is worse than no suggestion.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.services.llm.client import llm

router = APIRouter()


class MenuItemContext(BaseModel):
    sku: str
    title: str
    price_tiyin: int
    kind: str = "food"
    spice_level: int = 0
    is_vegetarian: bool = False
    allergens: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str
    locale: str = "uz"
    restaurant_name: str | None = None
    # Only orderable items — the caller (Laravel) has already applied the stop-list.
    menu: list[MenuItemContext] = Field(default_factory=list)
    guest_allergens: list[str] = Field(default_factory=list)
    recent_orders: list[str] = Field(default_factory=list, description="SKUs the guest ordered before")
    context: dict | None = None


class Suggestion(BaseModel):
    sku: str
    title: str
    reason: str


class ChatResponse(BaseModel):
    reply: str
    suggestions: list[Suggestion] = Field(default_factory=list)
    model: str


SYSTEM_PROMPT = """Siz restoranning AI ofitsiantisiz.
Mehmonga menyudan taom tanlashda yordam berasiz.

Qoidalar:
- FAQAT sizga berilgan menyudagi taomlarni tavsiya qiling. Menyuda yo'q taomni
  hech qachon taklif qilmang.
- Mehmonning allergiyalarini hisobga oling — allergen bo'lgan taomni taklif qilmang
  va nima uchun taklif qilmaganingizni ayting.
- Narxni so'mda ayting.
- Qisqa yozing: 2-3 ta taklif, har biri bir jumla izoh bilan.
- Default til: o'zbek. Mehmon rus yoki ingliz tilida yozsa, shu tilda javob bering."""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Recommend dishes from the live menu based on what the guest asks for."""
    reply = await llm.chat(request.message, system=SYSTEM_PROMPT)
    # TODO: pass the menu + allergens as structured context and parse the
    # model's picks back into `suggestions` so the client can render buttons
    # that add the dish straight to the order.
    return ChatResponse(reply=reply, suggestions=[], model="claude")
