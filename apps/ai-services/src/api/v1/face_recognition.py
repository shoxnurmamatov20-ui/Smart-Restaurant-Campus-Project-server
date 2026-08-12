"""Face recognition — xodim davomati uchun yuz tanish (Staff moduli).

Used for staff clock-in/clock-out at the service entrance. Never for guests:
recognising a guest's face without their consent is both a legal and a trust
problem, and the loyalty programme already identifies them by phone.
"""

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel, Field

router = APIRouter()


class FaceMatch(BaseModel):
    staff_member_id: str
    full_name: str | None = None
    confidence: float = Field(ge=0, le=1)
    bounding_box: dict      # {"x": ..., "y": ..., "w": ..., "h": ...}


class FaceVerificationResult(BaseModel):
    matched: bool
    matches: list[FaceMatch] = Field(default_factory=list)
    liveness_passed: bool = False   # anti-spoof: a photo of a photo must fail


@router.post("/verify", response_model=FaceVerificationResult)
async def verify_face(file: UploadFile) -> FaceVerificationResult:
    """Verify a face against the enrolled staff database (shift check-in)."""
    # TODO: implement
    # 1. Detect the face (MTCNN / RetinaFace)
    # 2. Liveness check (anti-spoofing — texture / depth / motion). Without
    #    this, one cook can clock in the whole brigade with a phone photo.
    # 3. Generate the embedding (FaceNet / ArcFace)
    # 4. Vector search against enrolled staff embeddings
    # 5. Return matches; Laravel writes the attendance row
    _ = file
    return FaceVerificationResult(matched=False, matches=[], liveness_passed=False)


@router.post("/enroll")
async def enroll_face(staff_member_id: str, file: UploadFile) -> dict:
    """Enroll a new face for a staff member."""
    # TODO: store the embedding in the vector DB, keyed by staff_member_id and
    # tenant. Raw photos are not kept — only the embedding.
    _ = (staff_member_id, file)
    return {"status": "enrolled", "staff_member_id": staff_member_id}
