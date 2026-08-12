"""Mehmon boti — restoranning mehmonlarga qaragan asosiy Telegram kanali.

Foydalanuvchi safari:
  /start   → salomlashuv (telefon majburiy emas)
  /menu    → joriy menyu (faqat sotuvda bor taomlar)
  /order   → buyurtma berish (telefon shu bosqichda so'raladi)
  /book    → stol bron qilish
  /bonus   → sodiqlik balansi va darajasi
  /myorders → oxirgi buyurtmalar
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from src.core.api_client import LaravelAPIError, LaravelClient
from src.handlers.onboarding import build_onboarding_router
from src.keyboards import guest_main_menu, rating_keyboard
from src.middlewares.i18n import Translator
from src.utils.format import format_uzs

BOT_KEY = "guest"

router = Router(name=f"bot:{BOT_KEY}")
router.include_router(build_onboarding_router(BOT_KEY))


# ============ Main menu ============

@router.message(Command("menu"))
async def show_main_menu(message: Message, i18n: Translator) -> None:
    await message.answer(i18n.t("menu.main"), reply_markup=guest_main_menu(i18n))


# ============ Menu ============

@router.message(Command("carte"))
@router.callback_query(F.data == "menu")
async def show_carte(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/menu", telegram_id=msg.from_user.id
        )
        categories = data.get("categories", [])
        if not categories:
            await send(i18n.t("empty.menu"))
            return

        lines = [f"📖 <b>{i18n.t('menu.menu')}</b>"]
        for category in categories:
            items = category.get("items", [])
            if not items:
                continue
            lines.append(f"\n<b>{category['title']}</b>")
            for item in items:
                price = format_uzs(item["price_tiyin"] // 100)
                allergens = item.get("allergens") or []
                mark = " ⚠️" if allergens else ""
                lines.append(f"• {item['title']} — <b>{price}</b>{mark}")

        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Orders ============

@router.message(Command("myorders"))
@router.callback_query(F.data == "myorders")
async def show_my_orders(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/me/orders", telegram_id=msg.from_user.id
        )
        orders = data.get("orders", [])
        if not orders:
            await send(i18n.t("empty.orders"))
            return

        lines = [f"🧾 <b>{i18n.t('menu.myorders')}</b>", ""]
        for order in orders[:10]:
            total = format_uzs(order["total_tiyin"] // 100)
            lines.append(
                f"{_status_emoji(order['status'])} <code>{order['number']}</code> "
                f"· {total} · {order['status']}"
            )
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


@router.message(Command("order"))
@router.callback_query(F.data == "order")
async def start_order(event: Message | CallbackQuery, i18n: Translator) -> None:
    _, send = _resolve(event)
    await send(
        {
            "uz": "🛒 Buyurtma berish uchun WebApp oynasini oching yoki ofitsiantni chaqiring.",
            "ru": "🛒 Чтобы сделать заказ, откройте WebApp или позовите официанта.",
            "en": "🛒 To place an order, open the WebApp or call a waiter.",
        }[i18n.locale]
    )


# ============ Reservation ============

@router.message(Command("book"))
@router.callback_query(F.data == "book")
async def book_table(event: Message | CallbackQuery, i18n: Translator) -> None:
    _, send = _resolve(event)
    await send(
        {
            "uz": "📅 Stol bron qilish uchun sana, vaqt va mehmonlar sonini yuboring.",
            "ru": "📅 Для брони пришлите дату, время и количество гостей.",
            "en": "📅 To book a table, send the date, time and number of guests.",
        }[i18n.locale]
    )


# ============ Loyalty ============

@router.message(Command("bonus"))
@router.callback_query(F.data == "bonus")
async def show_bonus(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/me/loyalty", telegram_id=msg.from_user.id
        )
        points = data.get("points", 0)
        tier = data.get("tier", "bronze")
        cashback = format_uzs(data.get("cashback_tiyin", 0) // 100)
        await send(
            f"💚 <b>{i18n.t('menu.bonus')}</b>\n\n"
            f"Ballar: <b>{points}</b>\n"
            f"Daraja: <b>{tier}</b>\n"
            f"Cashback: <b>{cashback}</b>"
        )
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Feedback ============

@router.message(Command("rate"))
@router.callback_query(F.data == "feedback")
async def ask_rating(event: Message | CallbackQuery, i18n: Translator) -> None:
    msg, _ = _resolve(event)
    prompt = {
        "uz": "⭐ Tashrifingizni baholang:",
        "ru": "⭐ Оцените ваш визит:",
        "en": "⭐ Rate your visit:",
    }[i18n.locale]
    await msg.answer(prompt, reply_markup=rating_keyboard())


@router.callback_query(F.data.startswith("rate:"))
async def save_rating(callback: CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    score = int(callback.data.split(":", 1)[1])
    try:
        await laravel._request(
            "POST",
            f"/bots/{BOT_KEY}/feedback",
            telegram_id=callback.from_user.id,
            json={"score": score},
        )
    except LaravelAPIError:
        # A guest who took the trouble to rate should never see a stack trace;
        # the rating is not worth blocking them over.
        pass

    await callback.answer()
    thanks = {
        "uz": "Rahmat! Fikringiz biz uchun juda muhim. 🙏",
        "ru": "Спасибо! Ваше мнение очень важно для нас. 🙏",
        "en": "Thank you! Your feedback matters. 🙏",
    }[i18n.locale]
    if callback.message:
        await callback.message.answer(thanks)


# ============ Help ============

@router.message(Command("help"))
async def show_help(message: Message) -> None:
    await message.answer(
        "ℹ️ <b>Mehmon bot komandalari</b>\n\n"
        "/start — botni qayta ulash\n"
        "/menu — asosiy menyu\n"
        "/carte — taomlar ro'yxati\n"
        "/order — buyurtma berish\n"
        "/book — stol bron qilish\n"
        "/bonus — sodiqlik balansi\n"
        "/myorders — buyurtmalarim\n"
        "/rate — tashrifni baholash\n"
        "/help — yordam"
    )


# ============ Helpers ============

def _resolve(event: Message | CallbackQuery) -> tuple[Message, callable]:
    """Return (message, send_func) so handlers work for both /command and inline callback."""
    if isinstance(event, CallbackQuery):
        msg = event.message
        assert msg is not None

        async def send(text: str) -> None:
            await event.answer()
            await msg.answer(text)

        return msg, send

    async def _send_msg(text: str) -> None:
        await event.answer(text)

    return event, _send_msg


def _status_emoji(status: str) -> str:
    return {
        "placed": "🕒",
        "in_kitchen": "🍳",
        "ready": "🔔",
        "served": "✅",
        "on_the_way": "🛵",
        "delivered": "📦",
        "paid": "💵",
        "cancelled": "❌",
    }.get(status, "•")
