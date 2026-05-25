"""Ota-ona boti — bola universitetidagi holatini real-time kuzatish.

Foydalanuvchi safari:
  /start → telefon yuborish → CAMPUS ota-ona profili linki
  /children → farzandlar ro'yxati (bir nechta bo'lishi mumkin)
  /grades [child_id] → tanlangan farzand baholari
  /attendance [child_id] → davomat
  /payments → kontrakt to'lov holati
  /messages → tyutor xabarlari
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.core.api_client import LaravelAPIError, LaravelClient
from src.handlers.onboarding import build_onboarding_router
from src.keyboards import parent_main_menu
from src.middlewares.i18n import Translator

BOT_KEY = "parent"

router = Router(name=f"bot:{BOT_KEY}")
router.include_router(build_onboarding_router(BOT_KEY))


@router.message(Command("menu"))
async def show_menu(message: Message, i18n: Translator) -> None:
    await message.answer(i18n.t("menu.main"), reply_markup=parent_main_menu(i18n))


@router.message(Command("children"))
@router.callback_query(F.data == "children")
async def show_children(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg = event.message if isinstance(event, CallbackQuery) else event
    user = event.from_user
    if user is None or msg is None:
        return
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/children", telegram_id=user.id)
        children = data.get("children", [])
        if not children:
            await msg.answer({
                "uz": "👶 Bog'langan farzand topilmadi.",
                "ru": "👶 Дети не привязаны.",
                "en": "👶 No linked children.",
            }[i18n.locale])
            return
        kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text=f"👶 {c['full_name']} ({c['group']})", callback_data=f"child:{c['id']}")]
                for c in children
            ]
        )
        await msg.answer(
            {
                "uz": f"Sizning farzandlaringiz ({len(children)} ta):",
                "ru": f"Ваши дети ({len(children)}):",
                "en": f"Your children ({len(children)}):",
            }[i18n.locale],
            reply_markup=kb,
        )
        if isinstance(event, CallbackQuery):
            await event.answer()
    except LaravelAPIError:
        await msg.answer(i18n.t("error.generic"))


@router.callback_query(F.data.startswith("child:"))
async def show_child_dashboard(cb: CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    if cb.message is None or cb.data is None:
        return
    child_id = cb.data.removeprefix("child:")
    try:
        data = await laravel._request(
            "GET",
            f"/bots/{BOT_KEY}/me/children/{child_id}/dashboard",
            telegram_id=cb.from_user.id,
        )
        c = data["child"]
        att = data.get("attendance_pct", 0)
        avg = data.get("avg_grade", 0)
        last_seen = data.get("last_seen_on_campus", "—")
        debt = data.get("contract_due_uzs", 0)
        text = (
            f"👶 <b>{c['full_name']}</b> ({c['group']})\n\n"
            f"📅 Bugun darslar: <b>{data.get('today_lessons', 0)}</b>\n"
            f"✅ Davomat: <b>{att}%</b>\n"
            f"💯 O'rtacha baho: <b>{avg}</b>\n"
            f"🚪 Universitetda oxirgi marotaba: <code>{last_seen}</code>\n"
            f"💳 Kontrakt qarzi: <b>{debt:,} so'm</b>"
        )
        await cb.message.answer(text)
        await cb.answer()
    except LaravelAPIError:
        await cb.message.answer(i18n.t("error.generic"))
        await cb.answer()


@router.message(Command("payments"))
@router.callback_query(F.data == "payments")
async def show_payments(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg = event.message if isinstance(event, CallbackQuery) else event
    user = event.from_user
    if user is None or msg is None:
        return
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/payments", telegram_id=user.id)
        items = data.get("upcoming", [])
        if not items:
            await msg.answer({
                "uz": "💳 Yaqin to'lovlar yo'q. Hammasi to'langan.",
                "ru": "💳 Предстоящих платежей нет. Всё оплачено.",
                "en": "💳 No upcoming payments. All clear.",
            }[i18n.locale])
            return
        lines = [f"💳 <b>{ {'uz': 'Yaqin to\\'lovlar', 'ru': 'Предстоящие платежи', 'en': 'Upcoming payments'}[i18n.locale] }</b>", ""]
        for it in items:
            lines.append(f"• {it['child_name']}: <b>{it['amount_uzs']:,} so'm</b> — {it['due_date']}")
        await msg.answer("\n".join(lines))
        if isinstance(event, CallbackQuery):
            await event.answer()
    except LaravelAPIError:
        await msg.answer(i18n.t("error.generic"))


@router.message(Command("help"))
async def show_help(message: Message) -> None:
    await message.answer(
        "ℹ️ <b>CAMPUS Ota-ona bot komandalar</b>\n\n"
        "/start — botni qayta ulash\n"
        "/menu — asosiy menyu\n"
        "/children — farzandlar ro'yxati\n"
        "/payments — kontrakt to'lov holati\n"
        "/help — yordam\n\n"
        "Muammo bo'lsa: @CampusSupport"
    )
