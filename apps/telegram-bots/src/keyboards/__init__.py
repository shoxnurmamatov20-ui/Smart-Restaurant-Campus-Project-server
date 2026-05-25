"""Reusable inline + reply keyboards."""

from __future__ import annotations

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)

from src.middlewares.i18n import Translator


def request_phone(i18n: Translator) -> ReplyKeyboardMarkup:
    """One-button keyboard that asks the user to share their phone."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text=("📱 " + ({"uz": "Telefon yuborish", "ru": "Поделиться телефоном", "en": "Share phone"}.get(i18n.locale, "Share phone"))),
                    request_contact=True,
                )
            ]
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=i18n.t("start.share_phone"),
    )


def remove() -> ReplyKeyboardRemove:
    return ReplyKeyboardRemove()


def student_main_menu(i18n: Translator) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=i18n.t("menu.schedule"), callback_data="schedule"),
                InlineKeyboardButton(text=i18n.t("menu.grades"), callback_data="grades"),
            ],
            [
                InlineKeyboardButton(text=i18n.t("menu.attendance"), callback_data="attendance"),
                InlineKeyboardButton(text=i18n.t("menu.balance"), callback_data="balance"),
            ],
            [
                InlineKeyboardButton(text=i18n.t("menu.library"), callback_data="library"),
                InlineKeyboardButton(text=i18n.t("menu.profile"), callback_data="profile"),
            ],
        ]
    )


def parent_main_menu(i18n: Translator) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text={"uz": "👶 Farzandlar", "ru": "👶 Дети", "en": "👶 Children"}[i18n.locale], callback_data="children"),
                InlineKeyboardButton(text=i18n.t("menu.grades"), callback_data="grades"),
            ],
            [
                InlineKeyboardButton(text=i18n.t("menu.attendance"), callback_data="attendance"),
                InlineKeyboardButton(text={"uz": "💳 To'lovlar", "ru": "💳 Платежи", "en": "💳 Payments"}[i18n.locale], callback_data="payments"),
            ],
            [
                InlineKeyboardButton(text=i18n.t("menu.profile"), callback_data="profile"),
                InlineKeyboardButton(text=i18n.t("menu.settings"), callback_data="settings"),
            ],
        ]
    )
