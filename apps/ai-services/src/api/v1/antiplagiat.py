"""Antiplagiat — plagiat tekshirish (Modul 13, Phase 2)."""

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel

router = APIRouter()


class PlagiarismResult(BaseModel):
    overall_score: float           # 0-100 (%)
    matched_sources: list[dict]    # [{"url": "...", "similarity": 0.8, "excerpt": "..."}]
    ai_generated_score: float      # 0-100 (%) — AI-detected probability


@router.post("/check", response_model=PlagiarismResult)
async def check_plagiarism(file: UploadFile) -> PlagiarismResult:
    """Check a document for plagiarism + AI-generated content detection."""
    # TODO: implement
    # 1. Extract text (PDF/DOCX → text)
    # 2. Compute embeddings (sentence-transformers)
    # 3. Vector search against internal corpus + web (Pinecone/Qdrant)
    # 4. AI-detection (separate model: e.g., GPTZero, custom classifier)
    # 5. Return matches with excerpts
    _ = file  # placeholder
    return PlagiarismResult(overall_score=0.0, matched_sources=[], ai_generated_score=0.0)
