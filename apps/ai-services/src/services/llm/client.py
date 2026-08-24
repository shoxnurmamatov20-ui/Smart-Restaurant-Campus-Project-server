"""Unified LLM client with fallback (Claude → GPT-4)."""

from anthropic import AsyncAnthropic
from anthropic.types import TextBlock
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

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
            AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
        )

    async def chat(self, prompt: str, system: str | None = None) -> str:
        """Send a chat message and return the response text."""
        # Try Anthropic first
        if self.anthropic:
            reply = await self.anthropic.messages.create(
                model=settings.ai_default_model,
                max_tokens=1024,
                system=system or "",
                messages=[{"role": "user", "content": prompt}],
            )

            # A reply is a list of blocks and only a text block carries prose.
            # Thinking, tool-use and the several tool-result blocks do not, so
            # reading `.text` off the first block unconditionally is an
            # AttributeError the moment the model returns anything but plain
            # text — which it will, the first time a tool is attached here.
            first = reply.content[0] if reply.content else None

            return first.text if isinstance(first, TextBlock) else ""

        # Fallback to OpenAI
        if self.openai:
            messages: list[ChatCompletionMessageParam] = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            # A separate name, not a second assignment to the one above: the two
            # SDKs return different types and reusing the variable told mypy the
            # Anthropic `Message` had `.choices`, which it does not.
            completion = await self.openai.chat.completions.create(
                model=settings.ai_fallback_model,
                messages=messages,
                max_tokens=1024,
            )

            return completion.choices[0].message.content or ""

        raise RuntimeError("No LLM API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)")


llm = LLMClient()
