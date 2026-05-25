"""API v1 routers aggregation."""

from fastapi import APIRouter

from . import antiplagiat, chatbot, dropout, face_recognition

router = APIRouter()

router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
router.include_router(antiplagiat.router, prefix="/antiplagiat", tags=["antiplagiat"])
router.include_router(dropout.router, prefix="/dropout", tags=["dropout"])
router.include_router(face_recognition.router, prefix="/face", tags=["face-recognition"])


@router.get("/", include_in_schema=False)
async def v1_root() -> dict[str, str]:
    """API v1 root."""
    return {"version": "1.0", "status": "ready"}
