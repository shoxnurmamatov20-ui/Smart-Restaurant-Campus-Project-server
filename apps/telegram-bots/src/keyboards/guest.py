"""Guest bot keyboards."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from src.middlewares.i18n import Translator


def guest_main_menu(i18n: Translator) -> InlineKeyboardMarkup:
    """Main inline menu rendered by /menu and after /start."""
    rows = [
        [
            InlineKeyboardButton(text=i18n.t("menu.menu"), callback_data="menu"),
            InlineKeyboardButton(text=i18n.t("menu.order"), callback_data="order"),
        ],
        [
            InlineKeyboardButton(text=i18n.t("menu.book"), callback_data="book"),
            InlineKeyboardButton(text=i18n.t("menu.myorders"), callback_data="myorders"),
        ],
        [
            InlineKeyboardButton(text=i18n.t("menu.bonus"), callback_data="bonus"),
            InlineKeyboardButton(text=i18n.t("menu.feedback"), callback_data="feedback"),
        ],
        [InlineKeyboardButton(text=i18n.t("menu.help"), callback_data="help")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def rating_keyboard() -> InlineKeyboardMarkup:
    """One-tap 1-5 star rating — the only feedback form a guest will finish."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="⭐", callback_data="rate:1"),
                InlineKeyboardButton(text="⭐⭐", callback_data="rate:2"),
                InlineKeyboardButton(text="⭐⭐⭐", callback_data="rate:3"),
            ],
            [
                InlineKeyboardButton(text="⭐⭐⭐⭐", callback_data="rate:4"),
                InlineKeyboardButton(text="⭐⭐⭐⭐⭐", callback_data="rate:5"),
            ],
        ]
    )
