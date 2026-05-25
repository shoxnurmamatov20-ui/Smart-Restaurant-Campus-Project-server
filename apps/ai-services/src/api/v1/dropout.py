"""Dropout Prediction — talaba ketib qolish bashorati (Modul 28, Phase 2)."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class DropoutFeatures(BaseModel):
    student_id: str
    attendance_rate: float          # 0-1
    avg_grade: float                # 0-100
    failed_subjects: int
    library_visits_per_month: int
    online_lesson_participation: float
    psychological_risk_score: float | None = None
    days_since_last_login: int


class DropoutPrediction(BaseModel):
    student_id: str
    risk_score: float               # 0-1 (probability of dropping out)
    risk_level: str                 # low | medium | high | critical
    top_factors: list[str]          # human-readable explanations
    recommended_interventions: list[str]


@router.post("/predict", response_model=DropoutPrediction)
async def predict_dropout(features: DropoutFeatures) -> DropoutPrediction:
    """Predict the probability of a student dropping out."""
    # TODO: implement
    # 1. Load trained model (scikit-learn / XGBoost) from models_data/
    # 2. Feature engineering
    # 3. Predict probability
    # 4. Use SHAP for explainability (top factors)
    # 5. Map to intervention library
    return DropoutPrediction(
        student_id=features.student_id,
        risk_score=0.0,
        risk_level="low",
        top_factors=[],
        recommended_interventions=[],
    )
