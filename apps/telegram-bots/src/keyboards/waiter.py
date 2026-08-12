"""Waiter bot keyboards."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from src.middlewares.i18n import Translator


def waiter_main_menu(i18n: Translator) -> InlineKeyboardMarkup:
    """Main inline menu for the waiter bot."""
    calls_label = {
        "uz": "🔔 Mehmon chaqiruvlari",
        "ru": "🔔 Вызовы гостей",
        "en": "🔔 Guest calls",
    }[i18n.locale]

    rows = [
        [
            InlineKeyboardButton(text=i18n.t("menu.tables"), callback_data="tables"),
            InlineKeyboardButton(text=i18n.t("menu.myorders"), callback_data="myorders"),
        ],
        [
            InlineKeyboardButton(text=calls_label, callback_data="calls"),
            InlineKeyboardButton(text=i18n.t("menu.shift"), callback_data="shift"),
        ],
        [InlineKeyboardButton(text=i18n.t("menu.help"), callback_data="help")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def order_actions(order_id: int, i18n: Translator) -> InlineKeyboardMarkup:
    """Per-order actions a waiter takes without leaving the chat."""
    served = {"uz": "✅ Berildi", "ru": "✅ Подано", "en": "✅ Served"}[i18n.locale]
    bill = {"uz": "🧾 Hisob", "ru": "🧾 Счёт", "en": "🧾 Bill"}[i18n.locale]

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=served, callback_data=f"order:served:{order_id}"),
                InlineKeyboardButton(text=bill, callback_data=f"order:bill:{order_id}"),
            ]
        ]
    )
