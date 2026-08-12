"""Shared keyboards used by every bot (phone request, remove, back, cancel)."""

from __future__ import annotations

from aiogram.types import (
    InlineKeyboardButton,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)

from src.middlewares.i18n import Translator


def remove() -> ReplyKeyboardRemove:
    """Remove any visible reply keyboard."""
    return ReplyKeyboardRemove()


def request_phone(i18n: Translator) -> ReplyKeyboardMarkup:
    """Reply keyboard asking the user to share their phone (request_contact=True)."""
    label_short = {
        "uz": "Telefon yuborish",
        "ru": "Поделиться телефоном",
        "en": "Share phone",
    }.get(i18n.locale, "Share phone")
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=f"📱 {label_short}", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=i18n.t("start.share_phone"),
    )


def back_button(i18n: Translator) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=i18n.t("menu.back"), callback_data="back")


def cancel_button(i18n: Translator) -> InlineKeyboardButton:
    label = {
        "uz": "❌ Bekor qilish",
        "ru": "❌ Отмена",
        "en": "❌ Cancel",
    }.get(i18n.locale, "❌ Cancel")
    return InlineKeyboardButton(text=label, callback_data="cancel")
