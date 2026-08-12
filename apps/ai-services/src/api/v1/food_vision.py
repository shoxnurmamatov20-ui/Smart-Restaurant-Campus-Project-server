"""Food vision — taom rasmini tanish va porsiya nazorati (Phase 2).

Two jobs a camera does better than a person:
  * plating control — does what left the pass actually match the tech card?
  * hygiene — is the mask/glove/cleanliness rule being followed on the line?
"""

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel, Field

router = APIRouter()


class DishMatch(BaseModel):
    menu_item_id: int | None = None
    sku: str | None = None
    label: str
    confidence: float = Field(ge=0, le=1)


class DishRecognitionResult(BaseModel):
    matches: list[DishMatch] = Field(default_factory=list)
    estimated_weight_grams: int | None = None


@router.post("/recognize", response_model=DishRecognitionResult)
async def recognize_dish(file: UploadFile) -> DishRecognitionResult:
    """Identify which menu item is on the plate."""
    # TODO: implement
    # 1. Preprocess the frame (resize, normalise)
    # 2. Run the classifier fine-tuned on this tenant's own dish photos
    # 3. Map the label back to a menu_item_id
    # 4. Optionally estimate portion weight from a reference object in frame
    _ = file
    return DishRecognitionResult(matches=[], estimated_weight_grams=None)


class PlatingCheckRequest(BaseModel):
    menu_item_id: int
    tolerance_percent: int = Field(default=15, ge=1, le=50)


class PlatingCheckResult(BaseModel):
    menu_item_id: int
    passed: bool
    deviation_percent: float
    issues: list[str] = Field(default_factory=list)


@router.post("/plating-check", response_model=PlatingCheckResult)
async def plating_check(request: PlatingCheckRequest, file: UploadFile) -> PlatingCheckResult:
    """Compare a plated dish against its reference photo and tech card."""
    # TODO: compare against the reference image + expected weight, and flag
    # missing components (no garnish, wrong sauce, wrong plate).
    _ = file
    return PlatingCheckResult(
        menu_item_id=request.menu_item_id,
        passed=True,
        deviation_percent=0.0,
        issues=[],
    )


class HygieneEvent(BaseModel):
    kind: str = Field(description="no_gloves | no_mask | no_hairnet | dirty_surface")
    confidence: float = Field(ge=0, le=1)
    at_second: float


class HygieneCheckResult(BaseModel):
    events: list[HygieneEvent] = Field(default_factory=list)


@router.post("/hygiene-check", response_model=HygieneCheckResult)
async def hygiene_check(file: UploadFile) -> HygieneCheckResult:
    """Scan a kitchen camera frame or clip for HACCP violations."""
    # TODO: object detection (YOLO) for gloves/mask/hairnet + surface state.
    # Findings feed the `haccp` Telegram bot, not a disciplinary file — the
    # point is a reminder in the moment, not a paper trail.
    _ = file
    return HygieneCheckResult(events=[])
