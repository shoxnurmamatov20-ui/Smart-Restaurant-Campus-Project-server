"""Shared onboarding router — /start + phone verification.

Reusable across any bot that requires phone-based platform user linking.
Per-bot router can `include_router(onboarding_router(bot_key=...))`.
"""

from __future__ import annotations

import phonenumbers
from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from src.core.api_client import LaravelAPIError, LaravelClient
from src.keyboards import remove, request_phone
from src.middlewares.i18n import Translator
from src.states import OnboardingStates


def build_onboarding_router(bot_key: str) -> Router:
    """Returns a router for /start + phone-based user linking, scoped to one bot."""
    router = Router(name=f"onboarding:{bot_key}")

    @router.message(CommandStart())
    async def on_start(message: Message, i18n: Translator, state: FSMContext, laravel: LaravelClient) -> None:
        await state.clear()
        user = message.from_user
        if user is None:
            await message.answer("Foydalanuvchi aniqlanmadi.")
            return

        # Check if already linked
        linked = await laravel.get_linked_user(bot_key=bot_key, telegram_id=user.id)
        if linked:
            full_name = linked.get("user", {}).get("full_name", user.full_name)
            await message.answer(
                i18n.t("start.welcome", name=user.first_name or user.full_name),
                reply_markup=remove(),
            )
            await message.answer(
                i18n.t("start.linked", full_name=full_name),
            )
            await state.set_state(OnboardingStates.done)
            return

        await message.answer(i18n.t("start.welcome", name=user.first_name or user.full_name))
        await message.answer(
            i18n.t("start.share_phone"),
            reply_markup=request_phone(i18n),
        )
        await state.set_state(OnboardingStates.waiting_for_phone)

    @router.message(OnboardingStates.waiting_for_phone, F.contact)
    async def on_phone(message: Message, i18n: Translator, state: FSMContext, laravel: LaravelClient) -> None:
        contact = message.contact
        user = message.from_user
        if not contact or not user:
            return

        # Security: telegram allows users to forward someone else's contact.
        # Only accept their OWN phone.
        if contact.user_id != user.id:
            await message.answer(
                {"uz": "❌ Iltimos, faqat o'z raqamingizni yuboring.",
                 "ru": "❌ Пожалуйста, отправьте только свой номер.",
                 "en": "❌ Please send only your own phone number."}[i18n.locale]
            )
            return

        phone_e164 = _normalize(contact.phone_number)
        await message.answer(
            i18n.t("start.shared", phone=phone_e164),
            reply_markup=remove(),
        )

        try:
            await state.set_state(OnboardingStates.linking)
            result = await laravel.link_telegram_user(
                bot_key=bot_key,
                telegram_id=user.id,
                phone=phone_e164,
                full_name=user.full_name,
                username=user.username,
            )
            full_name = result.get("user", {}).get("full_name", user.full_name)
            await message.answer(i18n.t("start.linked", full_name=full_name))
            await state.set_state(OnboardingStates.done)
        except LaravelAPIError as e:
            if e.status == 404:
                await message.answer(i18n.t("start.not_found"))
            else:
                await message.answer(i18n.t("error.generic"))
            await state.clear()

    return router


def _normalize(raw: str) -> str:
    """Convert a Telegram phone string to E.164."""
    candidate = raw if raw.startswith("+") else f"+{raw}"
    try:
        parsed = phonenumbers.parse(candidate, "UZ")
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        pass
    return candidate
