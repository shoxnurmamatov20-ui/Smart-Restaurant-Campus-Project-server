"""Catalog of every Smart Restaurant Campus Telegram bot (10 live + 40 planned).

Adding a new bot:
  1. Append a BotDefinition entry below.
  2. (Optional) Create a handler module under src/bots/<key>.py.
  3. Set BOT_TOKEN_<KEY> in .env to the @BotFather token.
  4. Restart the dispatcher — the Telegram webhook auto-registers on startup.

This registry is the single source of truth. apps/admin renders the bot
management UI from it via the Laravel TelegramBots module, so a key added here
and nowhere else still shows up in the back office.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class BotPhase(str, Enum):
    PHASE_1 = "phase-1"
    PHASE_2 = "phase-2"
    PHASE_3 = "phase-3"


class BotAudience(str, Enum):
    """Who the bot is primarily for — mirrors the restaurant RBAC roles."""

    GUEST = "guest"            # mehmon / mijoz
    WAITER = "waiter"          # ofitsiant
    COOK = "cook"              # oshpaz
    CHEF = "chef"              # osh-boshi
    BARTENDER = "bartender"    # barmen
    CASHIER = "cashier"        # kassir
    HOST = "host"              # hostes
    COURIER = "courier"        # kuryer
    STOREKEEPER = "storekeeper"  # omborchi
    MANAGER = "manager"        # filial menejeri
    OWNER = "owner"            # restoran egasi
    ACCOUNTANT = "accountant"  # buxgalter
    MARKETER = "marketer"      # marketolog
    SUPPLIER = "supplier"      # yetkazib beruvchi
    SECURITY = "security"      # xavfsizlik
    STAFF = "staff"            # umumiy xodim
    ANY = "any"


@dataclass(frozen=True, slots=True)
class BotDefinition:
    key: str                                 # short id, env-safe (matches BOT_TOKEN_{KEY.upper()})
    name_uz: str
    name_ru: str
    name_en: str
    purpose: str                             # one-line description (Uzbek)
    audience: BotAudience
    module: str | None                       # linked Phase-1 module alias, if any
    phase: BotPhase = BotPhase.PHASE_2
    commands: tuple[str, ...] = field(default_factory=tuple)
    requires_phone: bool = True              # /start verifies the phone number
    requires_login: bool = True              # actions need a linked platform user

    @property
    def env_var(self) -> str:
        return f"BOT_TOKEN_{self.key.upper()}"


# ============================================================
# Phase 1 — the 10 bots a restaurant needs from day one
# ============================================================

PHASE_1_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition(
        key="guest",
        name_uz="Mehmon boti",
        name_ru="Бот гостя",
        name_en="Guest bot",
        purpose="Menyu, buyurtma, stol broni, bonus balansi — mehmon uchun asosiy kanal",
        audience=BotAudience.GUEST,
        module="menu",
        phase=BotPhase.PHASE_1,
        commands=("start", "menu", "order", "book", "bonus", "myorders", "help"),
        # A guest browsing the menu should not be forced to share a phone number;
        # the phone is only asked when they actually place an order.
        requires_phone=False,
        requires_login=False,
    ),
    BotDefinition(
        key="waiter",
        name_uz="Ofitsiant boti",
        name_ru="Бот официанта",
        name_en="Waiter bot",
        purpose="Stollar holati, 'taom tayyor' xabari, mehmon chaqiruvi, smena tushumi",
        audience=BotAudience.WAITER,
        module="orders",
        phase=BotPhase.PHASE_1,
        commands=("start", "tables", "myorders", "ready", "calls", "shift", "help"),
    ),
    BotDefinition(
        key="kitchen",
        name_uz="Oshxona boti",
        name_ru="Бот кухни",
        name_en="Kitchen bot",
        purpose="Yangi chiptalar, tayyorlash taymeri, stop-list e'lon qilish",
        audience=BotAudience.COOK,
        module="kitchen",
        phase=BotPhase.PHASE_1,
        commands=("start", "tickets", "start_cooking", "ready", "stop", "help"),
    ),
    BotDefinition(
        key="courier",
        name_uz="Kuryer boti",
        name_ru="Бот курьера",
        name_en="Courier bot",
        purpose="Yetkazish topshiriqlari, manzil va marshrut, yetkazildi belgisi",
        audience=BotAudience.COURIER,
        module="orders",
        phase=BotPhase.PHASE_1,
        commands=("start", "tasks", "accept", "delivered", "earnings", "help"),
    ),
    BotDefinition(
        key="manager",
        name_uz="Filial menejeri boti",
        name_ru="Бот менеджера филиала",
        name_en="Branch manager bot",
        purpose="Smena holati, kassa, kechikkan buyurtmalar, stop-list va ogohlantirishlar",
        audience=BotAudience.MANAGER,
        module="analytics",
        phase=BotPhase.PHASE_1,
        commands=("start", "shift", "revenue", "alerts", "stoplist", "staff", "help"),
    ),
    BotDefinition(
        key="owner",
        name_uz="Egasi boti",
        name_ru="Бот владельца",
        name_en="Owner bot",
        purpose="Kunlik tushum, filiallar taqqoslash, food-cost, kritik ogohlantirishlar",
        audience=BotAudience.OWNER,
        module="analytics",
        phase=BotPhase.PHASE_1,
        commands=("start", "today", "branches", "foodcost", "alerts", "help"),
    ),
    BotDefinition(
        key="loyalty",
        name_uz="Sodiqlik boti",
        name_ru="Бот лояльности",
        name_en="Loyalty bot",
        purpose="Bonus balansi, darajalar, promo-kodlar va shaxsiy takliflar",
        audience=BotAudience.GUEST,
        module="crm",
        phase=BotPhase.PHASE_1,
        commands=("start", "balance", "tier", "promo", "history", "help"),
    ),
    BotDefinition(
        key="reservation",
        name_uz="Bron boti",
        name_ru="Бот бронирования",
        name_en="Reservation bot",
        purpose="Stol bron qilish, tasdiqlash, eslatma va bekor qilish",
        audience=BotAudience.GUEST,
        module="tables",
        phase=BotPhase.PHASE_1,
        commands=("start", "book", "mybookings", "cancel", "help"),
    ),
    BotDefinition(
        key="feedback",
        name_uz="Fikr-mulohaza boti",
        name_ru="Бот отзывов",
        name_en="Feedback bot",
        purpose="Taom va xizmat bahosi, shikoyat, rahbariyatga to'g'ridan-to'g'ri murojaat",
        audience=BotAudience.GUEST,
        module="crm",
        phase=BotPhase.PHASE_1,
        commands=("start", "rate", "complaint", "help"),
        # Complaints must be possible without identifying yourself, otherwise the
        # honest ones never arrive.
        requires_phone=False,
        requires_login=False,
    ),
    BotDefinition(
        key="supplier",
        name_uz="Yetkazib beruvchi boti",
        name_ru="Бот поставщика",
        name_en="Supplier bot",
        purpose="Xarid arizalari, yetkazish jadvali, kirim tasdiqlash va hisob-kitob",
        audience=BotAudience.SUPPLIER,
        module="suppliers",
        phase=BotPhase.PHASE_1,
        commands=("start", "orders", "confirm", "invoices", "debt", "help"),
    ),
)


# ============================================================
# Phase 2+ — 40 planned bots (config-only, no handlers yet)
# ============================================================

_OPERATIONS_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition("stock_alert", "Ombor ogohlantirish boti", "Бот складских оповещений", "Stock alert bot",
                  "Ingredient minimal qoldiqdan pastga tushganda darhol xabar",
                  BotAudience.STOREKEEPER, module="inventory"),
    BotDefinition("waste", "Chiqim nazorati boti", "Бот списаний", "Waste control bot",
                  "Chiqim aktlari, buzilgan mahsulot va yo'qotishlar hisoboti",
                  BotAudience.MANAGER, module="inventory"),
    BotDefinition("haccp", "HACCP / sanitariya boti", "Бот HACCP", "HACCP bot",
                  "Muzlatkich harorati, tozalash jadvali, sanitariya kitobchasi muddati",
                  BotAudience.CHEF, module="staff"),
    BotDefinition("shift_swap", "Smena almashinuvi boti", "Бот обмена сменами", "Shift swap bot",
                  "Xodimlar smenani almashtirish so'rovi va menejer tasdig'i",
                  BotAudience.STAFF, module="staff"),
    BotDefinition("payroll", "Ish haqi boti", "Бот зарплаты", "Payroll bot",
                  "Ishlangan soatlar, servis haqi ulushi, oylik hisob-kitobi",
                  BotAudience.STAFF, module="staff"),
    BotDefinition("training", "Xodim o'qitish boti", "Бот обучения персонала", "Training bot",
                  "Yangi taom tex-kartasi, servis standartlari, mini-testlar",
                  BotAudience.STAFF, module="staff"),
    BotDefinition("recruiting", "Ishga qabul boti", "Бот найма", "Recruiting bot",
                  "Vakansiyalar, nomzod arizalari va suhbat jadvali",
                  BotAudience.MANAGER, module="staff"),
    BotDefinition("equipment", "Jihoz texnik xizmati boti", "Бот обслуживания оборудования", "Equipment bot",
                  "Pech, muzlatkich, kofemashina — texnik xizmat jadvali va buzilish arizasi",
                  BotAudience.MANAGER, module=None),
    BotDefinition("energy", "Energiya monitoringi boti", "Бот энергомониторинга", "Energy bot",
                  "Elektr va gaz iste'moli anomaliyalari, tejash tavsiyalari",
                  BotAudience.MANAGER, module=None),
    BotDefinition("security", "Xavfsizlik boti", "Бот охраны", "Security bot",
                  "CCTV hodisalari, kassa yonidagi shubhali harakat, tungi signal",
                  BotAudience.SECURITY, module=None),
)

_MARKETING_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition("birthday", "Tug'ilgan kun boti", "Бот дней рождения", "Birthday bot",
                  "Mijoz tug'ilgan kunida avtomatik taklif va sovg'a",
                  BotAudience.GUEST, module="crm"),
    BotDefinition("winback", "Qaytarish kampaniyasi boti", "Бот возврата гостей", "Win-back bot",
                  "Uzoq kelmagan mijozlarga shaxsiy taklif",
                  BotAudience.GUEST, module="crm"),
    BotDefinition("catering", "Banket / keytering boti", "Бот банкетов", "Catering bot",
                  "Banket so'rovi, menyu tanlash, oldindan to'lov",
                  BotAudience.GUEST, module="tables"),
    BotDefinition("corporate", "Korporativ mijozlar boti", "Бот корпоративных клиентов", "Corporate bot",
                  "Kompaniyalar uchun biznes-lanch shartnomasi va oylik hisob",
                  BotAudience.GUEST, module="crm"),
    BotDefinition("gift_card", "Sovg'a sertifikati boti", "Бот подарочных сертификатов", "Gift card bot",
                  "Sertifikat sotib olish, sovg'a qilish va faollashtirish",
                  BotAudience.GUEST, module="crm"),
    BotDefinition("review_watch", "Tashqi sharhlar boti", "Бот мониторинга отзывов", "Review watch bot",
                  "Google Maps, Yandex va agregatorlardagi yangi sharhlar",
                  BotAudience.MANAGER, module="crm"),
    BotDefinition("menu_ai", "AI menyu maslahatchi", "AI-помощник по меню", "AI menu assistant",
                  "Mehmon didiga qarab taom tavsiya qiladi (Claude API)",
                  BotAudience.GUEST, module="menu", requires_phone=False, requires_login=False),
    BotDefinition("nutrition", "Kaloriya va parhez boti", "Бот питания", "Nutrition bot",
                  "Kaloriya hisobi, parhez va sportchi menyusi",
                  BotAudience.GUEST, module="menu", requires_phone=False),
    BotDefinition("allergen", "Allergen ogohlantirish boti", "Бот аллергенов", "Allergen bot",
                  "Mehmon profilidagi allergiyalarga qarab xavfli taomlarni belgilaydi",
                  BotAudience.GUEST, module="menu"),
    BotDefinition("queue", "Navbat boti", "Бот очереди", "Queue bot",
                  "Kutish ro'yxati, navbat raqami va 'stolingiz tayyor' xabari",
                  BotAudience.GUEST, module="tables", requires_login=False),
)

_DELIVERY_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition("aggregator", "Agregatorlar boti", "Бот агрегаторов", "Aggregator bot",
                  "Yandex Eats, Express24, Uzum Tezkor buyurtmalari bitta oqimda",
                  BotAudience.MANAGER, module="orders"),
    BotDefinition("delivery_zone", "Yetkazish zonalari boti", "Бот зон доставки", "Delivery zone bot",
                  "Zona bo'yicha narx, minimal buyurtma va yetkazish vaqti",
                  BotAudience.MANAGER, module="orders"),
    BotDefinition("driver_dispatch", "Kuryer taqsimoti boti", "Бот распределения курьеров", "Dispatch bot",
                  "Buyurtmalarni kuryerlarga avtomatik taqsimlash va marshrut",
                  BotAudience.COURIER, module="orders"),
    BotDefinition("tracking", "Buyurtma kuzatuvi boti", "Бот отслеживания заказа", "Tracking bot",
                  "Mehmon uchun real-time yetkazish holati va kuryer joylashuvi",
                  BotAudience.GUEST, module="orders", requires_login=False),
)

_FINANCE_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition("cash_alert", "Kassa anomaliyasi boti", "Бот кассовых аномалий", "Cash alert bot",
                  "Ko'p bekor qilish, katta chegirma, kassa farqi — darhol egasiga",
                  BotAudience.OWNER, module="finance"),
    BotDefinition("fiscal", "Fiskal boti", "Бот фискализации", "Fiscal bot",
                  "Fiskal modul xatolari va chek yuborilmagan holatlar",
                  BotAudience.ACCOUNTANT, module="finance"),
    BotDefinition("debt", "Qarzdorlik boti", "Бот задолженностей", "Debt bot",
                  "Yetkazib beruvchi va korporativ mijoz qarzdorligi eslatmasi",
                  BotAudience.ACCOUNTANT, module="suppliers"),
    BotDefinition("budget", "Byudjet nazorati boti", "Бот бюджета", "Budget bot",
                  "Xarajat kategoriyasi rejadan oshganda ogohlantirish",
                  BotAudience.OWNER, module="finance"),
)

# Per-branch channels (8) — one bot per venue for internal announcements.
_BRANCH_BOTS: tuple[BotDefinition, ...] = tuple(
    BotDefinition(
        key=f"br_{slug}",
        name_uz=f"{name_uz} filiali boti",
        name_ru=f"Бот филиала {name_ru}",
        name_en=f"{name_en} branch bot",
        purpose=f"{name_uz} filiali xodimlari uchun ichki e'lonlar va smena xabarlari",
        audience=BotAudience.STAFF,
        module=None,
    )
    for slug, name_uz, name_ru, name_en in (
        ("chilonzor", "Chilonzor", "Чиланзар", "Chilonzor"),
        ("yunusobod", "Yunusobod", "Юнусабад", "Yunusobod"),
        ("mirzo_ulugbek", "Mirzo Ulug'bek", "Мирзо-Улугбек", "Mirzo Ulugbek"),
        ("sergeli", "Sergeli", "Сергели", "Sergeli"),
        ("yakkasaroy", "Yakkasaroy", "Яккасарай", "Yakkasaroy"),
        ("shayxontohur", "Shayxontohur", "Шайхантахур", "Shaykhontohur"),
        ("olmazor", "Olmazor", "Алмазар", "Olmazor"),
        ("bektemir", "Bektemir", "Бектемир", "Bektemir"),
    )
)

_CONCEPT_BOTS: tuple[BotDefinition, ...] = (
    BotDefinition("concept_pizza", "Pizza konsepti boti", "Бот пиццерии", "Pizza concept bot",
                  "Pizza yo'nalishi uchun alohida menyu va aksiyalar kanali",
                  BotAudience.GUEST, module="menu", requires_login=False),
    BotDefinition("concept_coffee", "Kofexona konsepti boti", "Бот кофейни", "Coffee concept bot",
                  "Kofexona menyusi, sodiqlik kartasi va yangi ta'mlar",
                  BotAudience.GUEST, module="menu", requires_login=False),
    BotDefinition("franchise", "Franchayzing boti", "Бот франчайзинга", "Franchise bot",
                  "Franchayzi hamkorlar uchun standartlar, hisobot va royalti",
                  BotAudience.OWNER, module=None),
    BotDefinition("audit", "Ichki audit boti", "Бот внутреннего аудита", "Internal audit bot",
                  "Tekshiruv ro'yxatlari (checklist), sirli mehmon natijalari",
                  BotAudience.OWNER, module=None),
)


PHASE_2_BOTS: tuple[BotDefinition, ...] = (
    *_OPERATIONS_BOTS,
    *_MARKETING_BOTS,
    *_DELIVERY_BOTS,
    *_FINANCE_BOTS,
    *_BRANCH_BOTS,
    *_CONCEPT_BOTS,
)


ALL_BOTS: tuple[BotDefinition, ...] = PHASE_1_BOTS + PHASE_2_BOTS

BOTS_BY_KEY: dict[str, BotDefinition] = {b.key: b for b in ALL_BOTS}


def get_bot(key: str) -> BotDefinition | None:
    """Look up a bot by its short key."""
    return BOTS_BY_KEY.get(key)


def total_count() -> int:
    return len(ALL_BOTS)
