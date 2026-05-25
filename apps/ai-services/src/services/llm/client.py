"""Unified LLM client with fallback (Claude → GPT-4)."""

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from src.core.config import settings


class LLMClient:
    """Unified async LLM client with provider fallback."""

    def __init__(self) -> None:
        self.anthropic = (
            AsyncAnthropic(api_key=settings.anthropic_api_key)
            if settings.anthropic_api_key
            else None
        )
        self.openai = (
            AsyncOpenAI(api_key=settings.openai_api_key)
            if settings.openai_api_key
            else None
        )

    async def chat(self, prompt: str, system: str | None = None) -> str:
        """Send a chat message and return the response text."""
        # Try Anthropic first
        if self.anthropic:
            response = await self.anthropic.messages.create(
                model=settings.ai_default_model,
                max_tokens=1024,
                system=system or "",
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text if response.content else ""

        # Fallback to OpenAI
        if self.openai:
            messages: list = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            response = await self.openai.chat.completions.create(
                model=settings.ai_fallback_model,
                messages=messages,
                max_tokens=1024,
            )
            return response.choices[0].message.content or ""

        raise RuntimeError("No LLM API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)")


llm = LLMClient()
