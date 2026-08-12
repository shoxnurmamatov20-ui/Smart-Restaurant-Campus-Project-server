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
        "menu.menu": "📖 Menyu",
        "menu.order": "🛒 Buyurtma berish",
        "menu.myorders": "🧾 Buyurtmalarim",
        "menu.book": "📅 Stol bron qilish",
        "menu.bonus": "💚 Bonus balansi",
        "menu.feedback": "⭐ Fikr bildirish",
        "menu.tables": "🪑 Stollar",
        "menu.tickets": "🍳 Chiptalar",
        "menu.shift": "🕒 Smena",
        "menu.revenue": "💵 Tushum",
        "menu.help": "❓ Yordam",
        "menu.profile": "👤 Profil",
        "menu.settings": "⚙️ Sozlamalar",
        "menu.back": "⬅️ Orqaga",
        "start.welcome": "Assalomu alaykum, {name}! Restoranimiz botiga xush kelibsiz.",
        "start.share_phone": "Davom etish uchun telefon raqamingizni yuboring 👇",
        "start.shared": "Rahmat, {phone}. Tekshirilmoqda...",
        "start.linked": "✅ Akkauntingiz bog'landi: <b>{full_name}</b>",
        "start.not_found": (
            "❌ Bu raqam tizimda topilmadi.\n"
            "Xodim bo'lsangiz — menejeringizga murojaat qiling."
        ),
        "error.generic": "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        "error.unauthorized": "Bu amal uchun avval /start orqali ro'yxatdan o'ting.",
        "empty.menu": "📖 Menyu hozircha bo'sh.",
        "empty.orders": "🧾 Sizda faol buyurtma yo'q.",
        "empty.tickets": "🍳 Yangi chipta yo'q.",
        "empty.tables": "🪑 Sizga biriktirilgan stol yo'q.",
    },
    "ru": {
        "menu.main": "🏠 Главное меню",
        "menu.menu": "📖 Меню",
        "menu.order": "🛒 Сделать заказ",
        "menu.myorders": "🧾 Мои заказы",
        "menu.book": "📅 Забронировать стол",
        "menu.bonus": "💚 Бонусный баланс",
        "menu.feedback": "⭐ Оставить отзыв",
        "menu.tables": "🪑 Столы",
        "menu.tickets": "🍳 Заказы на кухне",
        "menu.shift": "🕒 Смена",
        "menu.revenue": "💵 Выручка",
        "menu.help": "❓ Помощь",
        "menu.profile": "👤 Профиль",
        "menu.settings": "⚙️ Настройки",
        "menu.back": "⬅️ Назад",
        "start.welcome": "Здравствуйте, {name}! Добро пожаловать в бот нашего ресторана.",
        "start.share_phone": "Чтобы продолжить, поделитесь номером телефона 👇",
        "start.shared": "Спасибо, {phone}. Проверяем...",
        "start.linked": "✅ Ваш аккаунт связан: <b>{full_name}</b>",
        "start.not_found": (
            "❌ Этот номер не найден в системе.\n"
            "Если вы сотрудник — обратитесь к менеджеру."
        ),
        "error.generic": "Произошла ошибка. Пожалуйста, попробуйте снова.",
        "error.unauthorized": "Для этого действия зарегистрируйтесь через /start.",
        "empty.menu": "📖 Меню пока пустое.",
        "empty.orders": "🧾 Активных заказов нет.",
        "empty.tickets": "🍳 Новых заказов нет.",
        "empty.tables": "🪑 За вами не закреплено ни одного стола.",
    },
    "en": {
        "menu.main": "🏠 Main menu",
        "menu.menu": "📖 Menu",
        "menu.order": "🛒 Place an order",
        "menu.myorders": "🧾 My orders",
        "menu.book": "📅 Book a table",
        "menu.bonus": "💚 Loyalty balance",
        "menu.feedback": "⭐ Leave feedback",
        "menu.tables": "🪑 Tables",
        "menu.tickets": "🍳 Tickets",
        "menu.shift": "🕒 Shift",
        "menu.revenue": "💵 Revenue",
        "menu.help": "❓ Help",
        "menu.profile": "👤 Profile",
        "menu.settings": "⚙️ Settings",
        "menu.back": "⬅️ Back",
        "start.welcome": "Hello, {name}! Welcome to our restaurant bot.",
        "start.share_phone": "To continue, please share your phone number 👇",
        "start.shared": "Thanks, {phone}. Verifying...",
        "start.linked": "✅ Your account is linked: <b>{full_name}</b>",
        "start.not_found": (
            "❌ This number was not found.\n"
            "If you are a staff member, please contact your manager."
        ),
        "error.generic": "Something went wrong. Please try again.",
        "error.unauthorized": "Please register first via /start.",
        "empty.menu": "📖 The menu is empty right now.",
        "empty.orders": "🧾 You have no active orders.",
        "empty.tickets": "🍳 No new tickets.",
        "empty.tables": "🪑 No tables assigned to you.",
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
