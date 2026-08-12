"""Ofitsiant boti — zal xodimining cho'ntagidagi terminal.

Foydalanuvchi safari:
  /start    → telefon yuborish → xodim akkaunti bilan bog'lash → asosiy menyu
  /tables   → biriktirilgan stollar va ularning holati
  /myorders → o'z buyurtmalari
  /ready    → oshxona "tayyor" deb belgilagan taomlar
  /calls    → mehmon chaqiruvlari
  /shift    → smena tushumi va o'rtacha chek
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from src.core.api_client import LaravelAPIError, LaravelClient
from src.handlers.onboarding import build_onboarding_router
from src.keyboards import waiter_main_menu
from src.middlewares.i18n import Translator
from src.utils.format import format_uzs

BOT_KEY = "waiter"

router = Router(name=f"bot:{BOT_KEY}")
router.include_router(build_onboarding_router(BOT_KEY))


# ============ Main menu ============

@router.message(Command("menu"))
async def show_menu(message: Message, i18n: Translator) -> None:
    await message.answer(i18n.t("menu.main"), reply_markup=waiter_main_menu(i18n))


# ============ Tables ============

@router.message(Command("tables"))
@router.callback_query(F.data == "tables")
async def show_tables(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/me/tables", telegram_id=msg.from_user.id
        )
        tables = data.get("tables", [])
        if not tables:
            await send(i18n.t("empty.tables"))
            return

        lines = [f"🪑 <b>{i18n.t('menu.tables')}</b>", ""]
        for table in tables:
            lines.append(
                f"{_table_emoji(table['status'])} <b>{table['label']}</b> "
                f"· {table.get('hall') or '—'} · {table.get('seats', 0)} joy"
            )
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Orders ============

@router.message(Command("myorders"))
@router.callback_query(F.data == "myorders")
async def show_orders(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
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
        for order in orders[:15]:
            total = format_uzs(order["total_tiyin"] // 100)
            table = order.get("table_label") or order["channel"]
            lines.append(f"• <code>{order['number']}</code> · {table} · {total} · {order['status']}")
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Ready dishes ============

@router.message(Command("ready"))
async def show_ready(message: Message, i18n: Translator, laravel: LaravelClient) -> None:
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/me/ready", telegram_id=message.from_user.id
        )
        tickets = data.get("tickets", [])
        if not tickets:
            await message.answer(
                {
                    "uz": "🔔 Hozircha olib ketiladigan taom yo'q.",
                    "ru": "🔔 Пока нечего забирать.",
                    "en": "🔔 Nothing to pick up right now.",
                }[i18n.locale]
            )
            return

        lines = ["🔔 <b>Tayyor taomlar</b>", ""]
        for ticket in tickets:
            table = ticket.get("table_label") or "—"
            lines.append(f"• <code>{ticket['order_number']}</code> · {table} · {ticket['station']}")
        await message.answer("\n".join(lines))
    except LaravelAPIError:
        await message.answer(i18n.t("error.generic"))


# ============ Guest calls ============

@router.message(Command("calls"))
@router.callback_query(F.data == "calls")
async def show_calls(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/me/calls", telegram_id=msg.from_user.id
        )
        calls = data.get("calls", [])
        if not calls:
            await send(
                {
                    "uz": "🔕 Chaqiruvlar yo'q.",
                    "ru": "🔕 Вызовов нет.",
                    "en": "🔕 No calls.",
                }[i18n.locale]
            )
            return

        lines = ["🔔 <b>Mehmon chaqiruvlari</b>", ""]
        for call in calls:
            lines.append(f"• <b>{call['table_label']}</b> — {call.get('reason', 'chaqiruv')}")
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Shift ============

@router.message(Command("shift"))
@router.callback_query(F.data == "shift")
async def show_shift(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request(
            "GET", f"/bots/{BOT_KEY}/me/shift", telegram_id=msg.from_user.id
        )
        revenue = format_uzs(data.get("revenue_tiyin", 0) // 100)
        avg = format_uzs(data.get("average_cheque_tiyin", 0) // 100)
        await send(
            f"🕒 <b>{i18n.t('menu.shift')}</b>\n\n"
            f"Buyurtmalar: <b>{data.get('orders_count', 0)}</b>\n"
            f"Mehmonlar: <b>{data.get('guests_count', 0)}</b>\n"
            f"Tushum: <b>{revenue}</b>\n"
            f"O'rtacha chek: <b>{avg}</b>"
        )
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Help ============

@router.message(Command("help"))
async def show_help(message: Message) -> None:
    await message.answer(
        "ℹ️ <b>Ofitsiant bot komandalari</b>\n\n"
        "/start — botni qayta ulash\n"
        "/menu — asosiy menyu\n"
        "/tables — stollarim va holati\n"
        "/myorders — buyurtmalarim\n"
        "/ready — tayyor taomlar\n"
        "/calls — mehmon chaqiruvlari\n"
        "/shift — smena tushumi\n"
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


def _table_emoji(status: str) -> str:
    return {
        "free": "🟢",
        "occupied": "🔴",
        "reserved": "🟡",
        "cleaning": "🧽",
    }.get(status, "•")
