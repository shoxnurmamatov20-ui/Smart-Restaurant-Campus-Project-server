"""Simple i18n middleware: resolves user locale and injects translator into data dict."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

from src.core.config import settings


# Minimal in-process translation table.
# In production this is replaced by aiogram-i18n + .po files compiled with babel.
TRANSLATIONS: dict[str, dict[str, str]] = {
    "uz": {
        "menu.main": "🏠 Asosiy menyu",
        "menu.schedule": "📅 Dars jadvali",
        "menu.grades": "💯 Baholar",
        "menu.attendance": "✅ Davomat",
        "menu.balance": "💰 Balans",
        "menu.library": "📚 Kutubxona",
        "menu.help": "❓ Yordam",
        "menu.profile": "👤 Profil",
        "menu.settings": "⚙️ Sozlamalar",
        "menu.back": "⬅️ Orqaga",
        "start.welcome": "Assalomu alaykum, {name}! CAMPUS botiga xush kelibsiz.",
        "start.share_phone": "Davom etish uchun telefon raqamingizni yuboring 👇",
        "start.shared": "Rahmat, {phone}. Tekshirilmoqda...",
        "start.linked": "✅ Sizning CAMPUS akkauntingiz bog'landi: <b>{full_name}</b>",
        "start.not_found": (
            "❌ Bu raqam HEMIS/CAMPUS bazasida topilmadi.\n"
            "Iltimos, dekanat yoki HR bo'limiga murojaat qiling."
        ),
        "error.generic": "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        "error.unauthorized": "Bu amal uchun avval /start orqali ro'yxatdan o'ting.",
    },
    "ru": {
        "menu.main": "🏠 Главное меню",
        "menu.schedule": "📅 Расписание",
        "menu.grades": "💯 Оценки",
        "menu.attendance": "✅ Посещаемость",
        "menu.balance": "💰 Баланс",
        "menu.library": "📚 Библиотека",
        "menu.help": "❓ Помощь",
        "menu.profile": "👤 Профиль",
        "menu.settings": "⚙️ Настройки",
        "menu.back": "⬅️ Назад",
        "start.welcome": "Здравствуйте, {name}! Добро пожаловать в CAMPUS бот.",
        "start.share_phone": "Чтобы продолжить, поделитесь номером телефона 👇",
        "start.shared": "Спасибо, {phone}. Проверяем...",
        "start.linked": "✅ Ваш CAMPUS аккаунт связан: <b>{full_name}</b>",
        "start.not_found": (
            "❌ Этот номер не найден в HEMIS/CAMPUS.\n"
            "Пожалуйста, обратитесь в деканат или отдел кадров."
        ),
        "error.generic": "Произошла ошибка. Пожалуйста, попробуйте снова.",
        "error.unauthorized": "Для этого действия зарегистрируйтесь через /start.",
    },
    "en": {
        "menu.main": "🏠 Main menu",
        "menu.schedule": "📅 Schedule",
        "menu.grades": "💯 Grades",
        "menu.attendance": "✅ Attendance",
        "menu.balance": "💰 Balance",
        "menu.library": "📚 Library",
        "menu.help": "❓ Help",
        "menu.profile": "👤 Profile",
        "menu.settings": "⚙️ Settings",
        "menu.back": "⬅️ Back",
        "start.welcome": "Hello, {name}! Welcome to the CAMPUS bot.",
        "start.share_phone": "To continue, please share your phone number 👇",
        "start.shared": "Thanks, {phone}. Verifying...",
        "start.linked": "✅ Your CAMPUS account is linked: <b>{full_name}</b>",
        "start.not_found": (
            "❌ This number is not in HEMIS/CAMPUS.\n"
            "Please contact the dean's office or HR."
        ),
        "error.generic": "Something went wrong. Please try again.",
        "error.unauthorized": "Please register first via /start.",
    },
}


class Translator:
    def __init__(self, locale: str) -> None:
        self.locale = locale if locale in TRANSLATIONS else settings.default_locale

    def t(self, key: str, **kwargs: object) -> str:
        msg = TRANSLATIONS.get(self.locale, {}).get(key)
        if msg is None:
            msg = TRANSLATIONS.get("en", {}).get(key, key)
        return msg.format(**kwargs) if kwargs else msg


class I18nMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        # Naive: use Telegram language_code from user, fallback to default
        locale = settings.default_locale
        if isinstance(event, (Message, CallbackQuery)) and event.from_user:
            lang = event.from_user.language_code
            if lang:
                short = lang.split("-")[0].lower()
                if short in TRANSLATIONS:
                    locale = short
        data["i18n"] = Translator(locale)
        data["locale"] = locale
        return await handler(event, data)
