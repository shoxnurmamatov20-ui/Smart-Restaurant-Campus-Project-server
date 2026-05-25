"""Catalog of all CAMPUS Telegram bots (10 immediate + 40 Phase 2+).

Adding a new bot:
  1. Append a BotDefinition entry below.
  2. (Optional) Create a handler module under src/bots/<key>.py.
  3. Set BOT_TOKEN_<KEY> in .env to the @BotFather token.
  4. Restart the dispatcher — Telegram webhook auto-registers on startup.

The registry is the single source of truth — apps/admin reads it through the
Laravel API to render the bot management UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class BotPhase(str, Enum):
    PHASE_1 = "phase-1"
    PHASE_2 = "phase-2"
    PHASE_3 = "phase-3"


class BotAudience(str, Enum):
    """Who the bot is primarily for."""

    STUDENT = "student"
    PARENT = "parent"
    TEACHER = "teacher"
    EMPLOYEE = "employee"
    ADMIN = "admin"
    LIBRARIAN = "librarian"
    COOK = "cook"
    DRIVER = "driver"
    SECURITY = "security"
    PSYCHOLOGIST = "psychologist"
    ANY = "any"


@dataclass(frozen=True, slots=True)
class BotDefinition:
    key: str                                 # short id, env-safe (matches BOT_TOKEN_{KEY.upper()})
    name_uz: str
    name_ru: str
    name_en: str
    purpose: str                             # one-line description (Uzbek)
    audience: BotAudience
    module: str | None                       # linked Phase-1 module key, if any
    phase: BotPhase = BotPhase.PHASE_2
    commands: tuple[str, ...] = field(default_factory=tuple)
    requires_phone: bool = True              # /start verifies phone (HEMIS lookup)
    requires_login: bool = True              # actions need CAMPUS user link

    @property
    def env_var(self) -> str:
        return f"BOT_TOKEN_{self.key.upper()}"


# ============================================================
# Phase 1 — 10 immediate bots
# ============================================================

PHASE_1_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition(
        key="student",
        name_uz="Talaba boti",
        name_ru="Бот студента",
        name_en="Student bot",
        purpose="Talaba kabinetining Telegram nusxasi: jadval, baholar, davomat, kantin balansi",
        audience=BotAudience.STUDENT,
        module="students",
        phase=BotPhase.PHASE_1,
        commands=("start", "schedule", "grades", "attendance", "balance", "library", "help"),
    ),
    BotDefinition(
        key="parent",
        name_uz="Ota-ona boti",
        name_ru="Бот родителя",
        name_en="Parent bot",
        purpose="Farzandning universitetdagi holati: kelish-ketish, baholar, to'lovlar",
        audience=BotAudience.PARENT,
        module="students",
        phase=BotPhase.PHASE_1,
        commands=("start", "child", "grades", "attendance", "payments", "messages", "help"),
    ),
    BotDefinition(
        key="teacher",
        name_uz="O'qituvchi boti",
        name_ru="Бот преподавателя",
        name_en="Teacher bot",
        purpose="O'qituvchi uchun dars jadvali, davomat olish, baho qo'yish, KPI",
        audience=BotAudience.TEACHER,
        module="hr",
        phase=BotPhase.PHASE_1,
        commands=("start", "schedule", "attendance", "grade", "kpi", "tickets", "help"),
    ),
    BotDefinition(
        key="hr",
        name_uz="Kadrlar boti",
        name_ru="Бот отдела кадров",
        name_en="HR bot",
        purpose="Xodimlar uchun Face ID kelish-ketish, ta'til so'rovi, payslip",
        audience=BotAudience.EMPLOYEE,
        module="hr",
        phase=BotPhase.PHASE_1,
        commands=("start", "checkin", "checkout", "leave", "payslip", "help"),
    ),
    BotDefinition(
        key="library",
        name_uz="Kutubxona boti",
        name_ru="Бот библиотеки",
        name_en="Library bot",
        purpose="Kitob qidirish, band qilish, qaytarish eslatma, yangi kelganlar",
        audience=BotAudience.ANY,
        module="library",
        phase=BotPhase.PHASE_1,
        commands=("start", "search", "reserve", "myloans", "return", "help"),
    ),
    BotDefinition(
        key="cafeteria",
        name_uz="Kantin boti",
        name_ru="Бот столовой",
        name_en="Cafeteria bot",
        purpose="Kunlik menyu, balans, oldindan buyurtma, allergiya hisobiga",
        audience=BotAudience.ANY,
        module="media",  # placeholder — will be Phase 2 cafeteria module
        phase=BotPhase.PHASE_1,
        commands=("start", "menu", "order", "balance", "topup", "help"),
    ),
    BotDefinition(
        key="transport",
        name_uz="Transport boti",
        name_ru="Бот транспорта",
        name_en="Transport bot",
        purpose="Shuttle bus jadvali, real-time GPS, ota-ona uchun bola qaysi avtobusda",
        audience=BotAudience.ANY,
        module=None,
        phase=BotPhase.PHASE_1,
        commands=("start", "schedule", "track", "subscribe", "help"),
    ),
    BotDefinition(
        key="helpdesk",
        name_uz="Help Desk boti",
        name_ru="Бот техподдержки",
        name_en="Help Desk bot",
        purpose="IT yoki akademik ticket ochish, javob olish, FAQ",
        audience=BotAudience.ANY,
        module="rttm",
        phase=BotPhase.PHASE_1,
        commands=("start", "new", "mytickets", "faq", "agent", "help"),
    ),
    BotDefinition(
        key="edms",
        name_uz="Hujjat aylanishi boti",
        name_ru="Бот документооборота",
        name_en="EDMS bot",
        purpose="Tasdiqlash kutilayotgan hujjatlar, yangi arizalar bildirishnomasi",
        audience=BotAudience.EMPLOYEE,
        module="edms",
        phase=BotPhase.PHASE_1,
        commands=("start", "inbox", "outbox", "search", "help"),
    ),
    BotDefinition(
        key="rector",
        name_uz="Rektor boti",
        name_ru="Бот ректора",
        name_en="Rector bot",
        purpose="Rektor uchun KPI dashboard, kritik xabarnomalar, big-picture sayt",
        audience=BotAudience.ADMIN,
        module="kpi",
        phase=BotPhase.PHASE_1,
        commands=("start", "kpi", "alerts", "stats", "help"),
        requires_phone=True,
    ),
)


# ============================================================
# Phase 2+ — 40 future bots (config-only, no handlers yet)
# ============================================================

PHASE_2_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition("smart_classroom", "Smart Classroom boti", "Бот умной аудитории", "Smart Classroom bot",
                  "Sinfdagi IoT qurilmalar boshqaruvi (yorug'lik, AC, projector)",
                  BotAudience.TEACHER, module=None),
    BotDefinition("exam_proctor", "Imtihon proktorlik", "Бот проктора экзаменов", "Exam Proctor bot",
                  "Imtihon davomida anti-cheat hodisalari uchun real-time bildirishnoma",
                  BotAudience.TEACHER, module="exams"),
    BotDefinition("alumni", "Bitiruvchilar boti", "Бот выпускников", "Alumni bot",
                  "Bitiruvchilar tarmog'i: vakansiyalar, tadbirlar, mentorlik",
                  BotAudience.ANY, module=None),
    BotDefinition("anonymous_tip", "Anonim shikoyat boti", "Бот анонимных жалоб", "Anonymous Tip bot",
                  "Korrupsiya, zo'ravonlik, akademik nopok haqida anonim xabar",
                  BotAudience.ANY, module=None, requires_phone=False, requires_login=False),
    BotDefinition("dormitory", "Yotoqxona boti", "Бот общежития", "Dormitory bot",
                  "Yotoqxona joy bandlash, komendant murojaat, qoidalar",
                  BotAudience.STUDENT, module=None),
    BotDefinition("parking", "Parking boti", "Бот парковки", "Parking bot",
                  "Avtoturargoh bo'sh joylari, bron, to'lov",
                  BotAudience.EMPLOYEE, module=None),
    BotDefinition("security", "Xavfsizlik boti", "Бот охраны", "Security bot",
                  "Xavfsizlik xodimlari uchun real-time hodisalar, video monitoring linklari",
                  BotAudience.SECURITY, module=None),
    BotDefinition("sports", "Sport klublari boti", "Бот спортклубов", "Sports clubs bot",
                  "Sport seksiyalar jadvali, ro'yxatdan o'tish, natijalar",
                  BotAudience.STUDENT, module=None),
    BotDefinition("new_books", "Yangi kitoblar boti", "Бот новых книг", "New books bot",
                  "Kutubxonaga kelgan yangi kitoblar haftalik bildirishnomasi",
                  BotAudience.ANY, module="library"),
    BotDefinition("scholarships", "Stipendiya boti", "Бот стипендий", "Scholarships bot",
                  "Stipendiya muddati, hisob-kitobi, to'lov tarixi",
                  BotAudience.STUDENT, module=None),
    BotDefinition("research", "Ilmiy ishlar boti", "Бот научной работы", "Research bot",
                  "Maqola muddati, Scopus ko'rsatkichlari, grant chaqiriqlari",
                  BotAudience.TEACHER, module=None),
    BotDefinition("conferences", "Konferensiyalar boti", "Бот конференций", "Conferences bot",
                  "Yaqinlashayotgan konferensiyalar, registratsiya, eslatma",
                  BotAudience.TEACHER, module=None),
    BotDefinition("diplomas", "Diplom ishlari boti", "Бот дипломных работ", "Diplomas bot",
                  "BMI bosqichlari, antiplagiat natijasi, himoya jadvali",
                  BotAudience.STUDENT, module=None),
    BotDefinition("internship", "Amaliyot boti", "Бот практики", "Internship bot",
                  "Korxonalar bazasi, kundalik hisobot yuklash, baholash",
                  BotAudience.STUDENT, module=None),
    BotDefinition("career", "Karyera markazi boti", "Бот карьерного центра", "Career bot",
                  "Vakansiyalar, CV maslahat, mock interview natija",
                  BotAudience.STUDENT, module=None),
    BotDefinition("masterclass", "Masterclass boti", "Бот мастер-классов", "Masterclass bot",
                  "Tashqi mehmonlar masterklasslari jadvali va registratsiya",
                  BotAudience.ANY, module=None),
    BotDefinition("mental_health", "Ruhiy salomatlik boti", "Бот психологии", "Mental Health bot",
                  "Maxfiy psixolog murojaat, mood tracker, favqulodda yordam",
                  BotAudience.ANY, module="psychology", requires_phone=False),
    BotDefinition("emergency", "Favqulodda bildirishnoma", "Бот экстренных уведомлений", "Emergency bot",
                  "Yong'in, evakuatsiya, sog'liq favqulodda holatlarda push xabar",
                  BotAudience.ANY, module=None),
    BotDefinition("weather", "Ob-havo + transport buzilishi", "Бот погоды/транспорта", "Weather/transport bot",
                  "Tashqi sharoit (ob-havo, yo'l) buzilganda darslar va shuttle ta'siri",
                  BotAudience.ANY, module=None),
    BotDefinition("language_pair", "Til amaliyot boti", "Бот языкового обмена", "Language pair bot",
                  "Til o'rganmoqchi talabalar uchun juftlik chat (uz↔en, ru↔en)",
                  BotAudience.STUDENT, module=None),
    BotDefinition("ai_assistant", "AI yordamchi bot", "Бот AI-ассистента", "AI Assistant bot",
                  "GPT/Claude orqali universitet hayoti haqida 24/7 savol-javob (modul 27)",
                  BotAudience.ANY, module=None),
    BotDefinition("dropout_alert", "Dropout ogohlantirishi", "Бот предсказания отчисления", "Dropout alert bot",
                  "AI modul (modul 28) talaba o'qishni tashlash xavfini bashorat qilganda dekan boti",
                  BotAudience.ADMIN, module="kpi"),
    # Per-fakultet (8)
    *(
        BotDefinition(
            key=f"fac_{slug}",
            name_uz=f"{name_uz} fakulteti boti",
            name_ru=f"Бот факультета {name_ru}",
            name_en=f"{name_en} faculty bot",
            purpose=f"{name_uz} fakulteti talabalari uchun ichki e'lonlar, dekanat xabarnomasi",
            audience=BotAudience.STUDENT,
            module=None,
        )
        for slug, name_uz, name_ru, name_en in (
            ("it", "IT", "ИТ", "IT"),
            ("economics", "Iqtisodiyot", "Экономики", "Economics"),
            ("law", "Yuridik", "Юридический", "Law"),
            ("medicine", "Tibbiyot", "Медицины", "Medicine"),
            ("engineering", "Muhandislik", "Инженерный", "Engineering"),
            ("philology", "Filologiya", "Филологический", "Philology"),
            ("pedagogy", "Pedagogika", "Педагогический", "Pedagogy"),
            ("arts", "San'at", "Искусств", "Arts"),
        )
    ),
    # Per-kafedra (10 placeholders)
    *(
        BotDefinition(
            key=f"dep_{slug}",
            name_uz=f"{name_uz} kafedrasi boti",
            name_ru=f"Бот кафедры {name_ru}",
            name_en=f"{name_en} department bot",
            purpose=f"{name_uz} kafedrasi talaba va o'qituvchilari uchun maxsus kanal",
            audience=BotAudience.ANY,
            module=None,
        )
        for slug, name_uz, name_ru, name_en in (
            ("programming", "Dasturlash", "Программирования", "Programming"),
            ("networks", "Tarmoqlar", "Сетей", "Networks"),
            ("ai", "Sun'iy intellekt", "ИИ", "AI"),
            ("database", "Ma'lumotlar bazasi", "Баз данных", "Database"),
            ("marketing", "Marketing", "Маркетинга", "Marketing"),
            ("finance", "Moliya", "Финансов", "Finance"),
            ("management", "Menejment", "Менеджмента", "Management"),
            ("civil_law", "Fuqaroviy huquq", "Гражданского права", "Civil Law"),
            ("pediatrics", "Pediatriya", "Педиатрии", "Pediatrics"),
            ("surgery", "Xirurgiya", "Хирургии", "Surgery"),
        )
    ),
)


ALL_BOTS: tuple[BotDefinition, ...] = PHASE_1_BOTS + PHASE_2_BOTS

BOTS_BY_KEY: dict[str, BotDefinition] = {b.key: b for b in ALL_BOTS}


def get_bot(key: str) -> BotDefinition | None:
    """Look up a bot by its short key."""
    return BOTS_BY_KEY.get(key)


def total_count() -> int:
    return len(ALL_BOTS)
