"""AI Chatbot endpoint — 24/7 yordamchi (Modul 27, Phase 2)."""

from fastapi import APIRouter
from pydantic import BaseModel

from src.services.llm.client import llm

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    locale: str = "uz"
    context: dict | None = None


class ChatResponse(BaseModel):
    reply: str
    model: str


SYSTEM_PROMPT = """Siz CAMPUS Smart Campus platformasining yordamchi AI'sisiz.
Talabalar, o'qituvchilar va xodimlar uchun universitet hayoti haqida savollarga javob bering.
Default til: o'zbek. Foydalanuvchi rus yoki ingliz tilida yozsa, shu tilda javob bering."""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the AI chatbot and get a response."""
    reply = await llm.chat(request.message, system=SYSTEM_PROMPT)
    return ChatResponse(reply=reply, model="claude")
