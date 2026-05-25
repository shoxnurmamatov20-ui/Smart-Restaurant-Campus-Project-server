"""Face Recognition — yuz tanish (Modul 21 + HR/Exams uchun ishlatiladi)."""

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel

router = APIRouter()


class FaceMatch(BaseModel):
    user_id: str
    confidence: float       # 0-1
    bounding_box: dict      # {"x": ..., "y": ..., "w": ..., "h": ...}


class FaceVerificationResult(BaseModel):
    matched: bool
    matches: list[FaceMatch]
    liveness_passed: bool   # anti-spoof


@router.post("/verify", response_model=FaceVerificationResult)
async def verify_face(file: UploadFile) -> FaceVerificationResult:
    """Verify a face against the enrolled user database."""
    # TODO: implement
    # 1. Detect face (MTCNN / RetinaFace)
    # 2. Liveness check (anti-spoofing — Texture/Depth/Motion)
    # 3. Generate embedding (FaceNet / ArcFace)
    # 4. Vector search against enrolled embeddings (Pinecone/Qdrant)
    # 5. Return matches
    _ = file
    return FaceVerificationResult(matched=False, matches=[], liveness_passed=False)


@router.post("/enroll")
async def enroll_face(user_id: str, file: UploadFile) -> dict:
    """Enroll a new face for a user."""
    # TODO: store embedding in vector DB
    _ = (user_id, file)
    return {"status": "enrolled", "user_id": user_id}
