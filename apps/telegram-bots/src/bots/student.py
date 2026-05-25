"""Talaba boti — modul 2 (Students) Telegram klienti.

Foydalanuvchi safari:
  /start → telefon yuborish → CAMPUS user link → asosiy menyu
  /schedule → bugungi dars jadvali
  /grades → so'nggi baholar
  /attendance → davomat hisoboti
  /balance → kantin va kontrakt balansi
  /library → kutubxonadan qarz olingan kitoblar
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from src.core.api_client import LaravelAPIError, LaravelClient
from src.handlers.onboarding import build_onboarding_router
from src.keyboards import student_main_menu
from src.middlewares.i18n import Translator
from src.states import OnboardingStates

BOT_KEY = "student"

router = Router(name=f"bot:{BOT_KEY}")
router.include_router(build_onboarding_router(BOT_KEY))


# ============ Main menu ============

@router.message(Command("menu"))
@router.message(OnboardingStates.done, F.text == "/menu")
async def show_menu(message: Message, i18n: Translator) -> None:
    await message.answer(i18n.t("menu.main"), reply_markup=student_main_menu(i18n))


# ============ Schedule ============

@router.message(Command("schedule"))
@router.callback_query(F.data == "schedule")
async def show_schedule(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/schedule/today", telegram_id=msg.from_user.id)
        lessons = data.get("lessons", [])
        if not lessons:
            await send({"uz": "📅 Bugun darslaringiz yo'q.", "ru": "📅 Сегодня занятий нет.", "en": "📅 No classes today."}[i18n.locale])
            return
        lines = [f"📅 <b>{i18n.t('menu.schedule')}</b>", ""]
        for lesson in lessons:
            lines.append(
                f"• <code>{lesson['start']}-{lesson['end']}</code> "
                f"{lesson['subject']} · {lesson['classroom']} · {lesson['teacher']}"
            )
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Grades ============

@router.message(Command("grades"))
@router.callback_query(F.data == "grades")
async def show_grades(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/grades/recent", telegram_id=msg.from_user.id)
        grades = data.get("grades", [])
        if not grades:
            await send({"uz": "💯 Hozircha baholar yo'q.", "ru": "💯 Оценок пока нет.", "en": "💯 No grades yet."}[i18n.locale])
            return
        lines = [f"💯 <b>{i18n.t('menu.grades')}</b>", ""]
        for g in grades[:10]:
            emoji = "🟢" if g["score"] >= 86 else "🟡" if g["score"] >= 60 else "🔴"
            lines.append(f"{emoji} {g['subject']}: <b>{g['score']}</b> ({g['date']})")
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Attendance ============

@router.message(Command("attendance"))
@router.callback_query(F.data == "attendance")
async def show_attendance(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/attendance/summary", telegram_id=msg.from_user.id)
        pct = data.get("attendance_pct", 0)
        absent = data.get("absent_count", 0)
        bar = _bar(pct)
        await send(
            f"✅ <b>{i18n.t('menu.attendance')}</b>\n\n"
            f"Davomat: <b>{pct}%</b>\n{bar}\n\n"
            f"Qoldirilgan darslar: <b>{absent}</b>"
        )
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Balance ============

@router.message(Command("balance"))
@router.callback_query(F.data == "balance")
async def show_balance(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/balance", telegram_id=msg.from_user.id)
        cafeteria = data.get("cafeteria_uzs", 0)
        contract_due = data.get("contract_due_uzs", 0)
        await send(
            f"💰 <b>{i18n.t('menu.balance')}</b>\n\n"
            f"🍽 Kantin balansi: <b>{cafeteria:,} so'm</b>\n"
            f"📄 Kontrakt qarzi: <b>{contract_due:,} so'm</b>"
        )
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Library ============

@router.message(Command("library"))
@router.callback_query(F.data == "library")
async def show_library(event: Message | CallbackQuery, i18n: Translator, laravel: LaravelClient) -> None:
    msg, send = _resolve(event)
    try:
        data = await laravel._request("GET", f"/bots/{BOT_KEY}/me/library/loans", telegram_id=msg.from_user.id)
        loans = data.get("loans", [])
        if not loans:
            await send({"uz": "📚 Sizda qarz olingan kitoblar yo'q.", "ru": "📚 Книг на руках нет.", "en": "📚 No active loans."}[i18n.locale])
            return
        lines = [f"📚 <b>{i18n.t('menu.library')}</b>", ""]
        for loan in loans:
            lines.append(f"• {loan['title']} — qaytarish: <code>{loan['due_date']}</code>")
        await send("\n".join(lines))
    except LaravelAPIError:
        await send(i18n.t("error.generic"))


# ============ Help ============

@router.message(Command("help"))
async def show_help(message: Message, i18n: Translator) -> None:
    await message.answer(
        "ℹ️ <b>CAMPUS Talaba bot komandalar</b>\n\n"
        "/start — botni qayta ulash\n"
        "/menu — asosiy menyu\n"
        "/schedule — bugungi jadval\n"
        "/grades — so'nggi baholar\n"
        "/attendance — davomat\n"
        "/balance — kantin va kontrakt\n"
        "/library — kutubxona qarzlari\n"
        "/help — yordam\n\n"
        "Muammo bo'lsa: @CampusSupport"
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


def _bar(pct: int, *, width: int = 10) -> str:
    filled = round(width * pct / 100)
    return "▰" * filled + "▱" * (width - filled)
