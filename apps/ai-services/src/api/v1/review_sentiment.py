"""Review sentiment — mijoz fikrlarini tahlil qilish (CRM moduli, Phase 2).

A one-star review is easy to read. A hundred three-star reviews are not, and
that is where the actual problem hides. This endpoint turns free text — from
the feedback bot, Google Maps or a delivery aggregator — into something a
manager can act on before the weekend.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.services.llm.client import llm

router = APIRouter()


class ReviewRequest(BaseModel):
    text: str
    locale: str = "uz"
    source: str = Field(default="bot", description="bot | google | yandex | aggregator")
    rating: int | None = Field(default=None, ge=1, le=5)


class AspectScore(BaseModel):
    aspect: str = Field(description="food | service | speed | cleanliness | price | atmosphere")
    sentiment: float = Field(ge=-1, le=1)
    quote: str | None = None


class ReviewAnalysis(BaseModel):
    sentiment: float = Field(ge=-1, le=1)
    label: str = Field(description="negative | neutral | positive")
    aspects: list[AspectScore] = Field(default_factory=list)
    mentioned_dishes: list[str] = Field(default_factory=list)
    is_urgent: bool = Field(
        default=False,
        description="Food safety, injury or abuse — a manager must see it now",
    )
    suggested_reply: str | None = None


ANALYSIS_PROMPT = """Siz restoran uchun mijoz fikrlarini tahlil qiluvchi yordamchisiz.
Har bir fikr uchun quyidagilarni aniqlang:
- umumiy kayfiyat (-1 dan +1 gacha)
- qaysi jihatlar tilga olingan: taom, xizmat, tezlik, tozalik, narx, muhit
- aniq taom nomlari
- shoshilinchmi (oziq-ovqat xavfsizligi, sog'liqqa zarar, haqorat)
Javob faqat o'zbek tilida, qisqa va aniq bo'lsin."""


@router.post("/analyze", response_model=ReviewAnalysis)
async def analyze_review(request: ReviewRequest) -> ReviewAnalysis:
    """Analyse one review: sentiment, aspects, dishes, urgency."""
    # TODO: replace the placeholder with a real call once the aspect schema is
    # locked. Keeping the LLM call here (not in the bot) means every channel —
    # Telegram, web, aggregator — is scored the same way.
    _ = llm
    _ = request
    return ReviewAnalysis(
        sentiment=0.0,
        label="neutral",
        aspects=[],
        mentioned_dishes=[],
        is_urgent=False,
        suggested_reply=None,
    )


class DigestRequest(BaseModel):
    branch_code: str
    period_days: int = Field(default=7, ge=1, le=90)
    reviews: list[ReviewRequest] = Field(default_factory=list)


class DigestResult(BaseModel):
    branch_code: str
    average_sentiment: float
    top_complaints: list[str] = Field(default_factory=list)
    top_praise: list[str] = Field(default_factory=list)
    trending_down: list[str] = Field(default_factory=list)
    summary: str | None = None


@router.post("/digest", response_model=DigestResult)
async def review_digest(request: DigestRequest) -> DigestResult:
    """Weekly digest for a branch — what got worse, what got better."""
    # TODO: batch-analyse, cluster the aspects, compare against the previous
    # period, and hand the manager three things to fix rather than a wall of text.
    return DigestResult(
        branch_code=request.branch_code,
        average_sentiment=0.0,
        top_complaints=[],
        top_praise=[],
        trending_down=[],
        summary=None,
    )
