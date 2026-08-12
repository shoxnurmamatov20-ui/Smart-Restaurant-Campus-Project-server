"""API v1 routers aggregation."""

from fastapi import APIRouter

from . import chatbot, demand_forecast, face_recognition, food_vision, review_sentiment

router = APIRouter()

router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
router.include_router(demand_forecast.router, prefix="/demand", tags=["demand-forecast"])
router.include_router(food_vision.router, prefix="/vision", tags=["food-vision"])
router.include_router(review_sentiment.router, prefix="/reviews", tags=["review-sentiment"])
router.include_router(face_recognition.router, prefix="/face", tags=["face-recognition"])


@router.get("/", include_in_schema=False)
async def v1_root() -> dict[str, str]:
    """API v1 root."""
    return {"version": "1.0", "status": "ready"}
