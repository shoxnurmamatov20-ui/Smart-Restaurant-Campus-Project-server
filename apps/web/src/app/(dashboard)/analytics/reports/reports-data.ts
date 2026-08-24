/**
 * The standard reports, and the five that actually open.
 *
 * `Smart Restaurant OS.dc.html:3367-3449` draws the list; `REPORTS` at `:13600`
 * holds **eleven** cards, of which five carry an `id` and open a report viewer
 * (`reportView()`, `:11904-12079`) while the other six say they are being built
 * and will be emailed. The console shipped only those six — the half of the
 * screen with nothing behind it — so every card a manager could actually read
 * was missing.
 *
 * Nine carry an id today. Four of the six that only promised a file now answer
 * one, and the two that still do not are the two this module cannot reach: the
 * stock movement report needs Inventory and the labour report needs per-person
 * attendance, and both boundaries are deliberate.
 *
 * Two dialogs belong to this screen as well: the custom-report builder
 * (`rbld.buildOpen`, `:7974`) and the schedule sheet (`rbld.schedOpen`,
 * `:8021`). Both were page-head buttons that flashed a sentence.
 *
 * Money is integer tiyin. The design writes so'm and scales its fixtures by the
 * chosen period; `scale()` does that rounding in so'm and converts once, so no
 * figure is ever rounded twice.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export function say(value: Trilingual, lang: Lang): string {
  return value[lang] || value.uz;
}

/** 1 UZS = 100 tiyin. */
export function som(amount: number): number {
  return amount * 100;
}

const plain = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

/**
 * A monthly so'm figure, restated for the chosen period and returned in tiyin.
 *
 * Rounded in so'm before the conversion — the design rounds there, and rounding
 * tiyin instead leaves two decimal places on a figure that is supposed to be a
 * whole number of so'm.
 */
function scale(monthly: number, days: number): number {
  return som(Math.round((monthly * days) / 30));
}

/* ============================================================
   The eleven cards
   ============================================================ */

/**
 * The cards that open a viewer.
 *
 * Five to begin with; four more — the Z pack, sales by item, the VAT pack and
 * the branch comparison — once `StandardReports::build()` learned to answer
 * them. The two cards still without an id are the two that cannot be answered
 * from this module: stock movement needs Inventory, which Analytics may not
 * read, and labour needs per-person attendance, which `App\Contracts\Staff
 * \Roster` withholds on purpose. Both keep their Schedule button, which writes.
 */
export type ReportId =
  | 'waiters'
  | 'dishes'
  | 'voids'
  | 'stock'
  | 'cash'
  | 'zreport'
  | 'items'
  | 'vat'
  | 'branches'
  | 'labour';

export type ReportCard = {
  /** Present when the card opens a viewer instead of queueing a build. */
  id?: ReportId;
  name: Trilingual;
  body: Trilingual;
  schedule: Trilingual;
  formats: string;
};

const WEEKLY: Trilingual = {
  uz: 'Haftalik, dushanba',
  ru: 'Еженедельно, понедельник',
  en: 'Weekly, Monday',
};

const MONTHLY: Trilingual = {
  uz: 'Oylik, 1-sana',
  ru: 'Ежемесячно, 1-го',
  en: 'Monthly, 1st',
};

export const REPORT_CARDS: readonly ReportCard[] = [
  {
    id: 'waiters',
    name: {
      uz: "Ofitsiantlar bo'yicha hisobot",
      ru: 'Отчёт по официантам',
      en: 'Report by waiter',
    },
    body: {
      uz: "Kim qancha sotdi, o'rtacha cheki, chegirmasi va bekor qilishlari.",
      ru: 'Кто сколько продал, средний чек, скидки и отмены.',
      en: 'Who sold how much, average ticket, discounts and voids.',
    },
    schedule: {
      uz: 'Har smena oxirida',
      ru: 'В конце каждой смены',
      en: 'At the end of every shift',
    },
    formats: 'PDF, XLSX',
  },
  {
    id: 'dishes',
    name: { uz: "Taomlar bo'yicha hisobot", ru: 'Отчёт по блюдам', en: 'Report by dish' },
    body: {
      uz: 'Nechta sotildi, tannarx qancha, qancha foyda qoldi — marja bo’yicha saralangan.',
      ru: 'Сколько продано, себестоимость и прибыль — с сортировкой по марже.',
      en: 'Units sold, cost and profit, sorted by margin.',
    },
    schedule: WEEKLY,
    formats: 'XLSX',
  },
  {
    id: 'voids',
    name: {
      uz: 'Bekor qilingan taomlar hisoboti',
      ru: 'Отчёт по отменённым блюдам',
      en: 'Voided items report',
    },
    body: {
      uz: 'Nima bekor qilindi, kim qildi, qaysi bosqichda va nima sababdan.',
      ru: 'Что отменено, кем, на каком этапе и по какой причине.',
      en: 'What was voided, by whom, at which stage and why.',
    },
    schedule: { uz: 'Har kuni', ru: 'Ежедневно', en: 'Daily' },
    formats: 'PDF',
  },
  {
    id: 'stock',
    name: { uz: "Qoldiq bo'yicha hisobot", ru: 'Отчёт по остаткам', en: 'Stock report' },
    body: {
      uz: "Boshlang'ich qoldiq, kirim, sarf va oxirgi qoldiq — ombor kesimida.",
      ru: 'Начальный остаток, приход, расход и конечный остаток по складам.',
      en: 'Opening, in, out and closing balance, split by store.',
    },
    schedule: WEEKLY,
    formats: 'XLSX',
  },
  {
    id: 'cash',
    name: { uz: 'Pul oqimi hisoboti', ru: 'Отчёт о движении денег', en: 'Cash flow report' },
    body: {
      uz: 'Kassa, bank va qarz bo’yicha pul harakati. Tushumdan farq qiladi.',
      ru: 'Движение денег по кассе, банку и долгам. Отличается от выручки.',
      en: 'Money movement across till, bank and credit. Differs from revenue.',
    },
    schedule: MONTHLY,
    formats: 'PDF, XLSX',
  },
  {
    id: 'zreport',
    name: { uz: 'Z-hisobot, kun yakuni', ru: 'Z-отчёт, конец дня', en: 'Z-report, end of day' },
    body: {
      uz: "Bir smena uchun savdo, to'lovlar, bekor qilishlar va kassa sanog'i.",
      ru: 'Продажи, оплаты, отмены и пересчёт кассы за одну смену.',
      en: 'Sales, payments, voids and drawer count for one service day.',
    },
    schedule: { uz: 'Har kuni 23:59 da', ru: 'Ежедневно в 23:59', en: 'Daily at 23:59' },
    formats: 'PDF, XLSX',
  },
  {
    id: 'items',
    name: {
      uz: "Pozitsiyalar bo'yicha savdo",
      ru: 'Продажи по позициям',
      en: 'Sales by item',
    },
    body: {
      uz: "Har bir menyu pozitsiyasi bo'yicha dona, tushum va marja, kategoriya kesimida.",
      ru: 'Штуки, выручка и маржа по каждой позиции меню с разбивкой по категориям.',
      en: 'Units, revenue and margin per menu item with category rollup.',
    },
    schedule: WEEKLY,
    formats: 'XLSX',
  },
  {
    name: { uz: 'Ombor harakati', ru: 'Движение склада', en: 'Stock movement' },
    body: {
      uz: "Har bir mahsulot bo'yicha boshlang'ich qoldiq, xarid, sarf, chiqindi va yakuniy qoldiq.",
      ru: 'По каждому ингредиенту: начальный остаток, закупки, расход, списание и конечный остаток.',
      en: 'Opening, purchases, consumption, waste and closing per ingredient.',
    },
    schedule: WEEKLY,
    formats: 'XLSX',
  },
  {
    id: 'labour',
    name: { uz: 'Mehnat va davomat', ru: 'Труд и посещаемость', en: 'Labour and attendance' },
    body: {
      uz: "Rejalashtirilgan va haqiqiy soatlar, qo'shimcha ish va kechikishlar.",
      ru: 'План против факта по часам, переработки и опоздания.',
      en: 'Scheduled against actual hours, overtime and late clock-ins.',
    },
    schedule: { uz: 'Ikki haftada bir', ru: 'Раз в две недели', en: 'Bi-weekly' },
    formats: 'PDF',
  },
  {
    id: 'vat',
    name: { uz: "QQS hisoboti to'plami", ru: 'Пакет по НДС', en: 'VAT return pack' },
    body: {
      uz: 'Davr uchun soliqqa tortiladigan savdo, yig’ilgan QQS va imtiyozli moddalar.',
      ru: 'Налогооблагаемые продажи, собранный НДС и льготные статьи за период.',
      en: 'Taxable sales, VAT collected and exempt lines for the period.',
    },
    schedule: MONTHLY,
    formats: 'PDF, XML',
  },
  {
    id: 'branches',
    name: { uz: 'Filiallar taqqoslash', ru: 'Сравнение филиалов', en: 'Branch comparison' },
    body: {
      uz: "Barcha filiallar bo'yicha tushum, mehmonlar, o'rtacha chek va marja.",
      ru: 'Выручка, гости, средний чек и маржа по всем филиалам.',
      en: 'Revenue, covers, average order and margin across all branches.',
    },
    schedule: MONTHLY,
    formats: 'PDF',
  },
];

/* ============================================================
   The viewer
   ============================================================ */

export type PeriodKey = 'today' | 'week' | 'month' | 'quarter';

export const PERIODS: readonly { key: PeriodKey; label: Trilingual; days: number }[] = [
  { key: 'today', label: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' }, days: 1 },
  { key: 'week', label: { uz: 'Hafta', ru: 'Неделя', en: 'Week' }, days: 7 },
  { key: 'month', label: { uz: 'Oy', ru: 'Месяц', en: 'Month' }, days: 30 },
  { key: 'quarter', label: { uz: 'Chorak', ru: 'Квартал', en: 'Quarter' }, days: 90 },
];

export type Align = 'left' | 'right';

export type Cell = {
  /** Already formatted, or a tiyin amount the panel formats. */
  text?: Trilingual | string;
  tiyin?: number;
  /** Prefix for a signed figure the design writes by hand. */
  prefix?: string;
  align: Align;
  num: boolean;
  tone?: string;
};

export type ViewerKpi = {
  label: Trilingual;
  text?: Trilingual | string;
  tiyin?: number;
  delta: Trilingual | string;
  tone: string;
};

export type ReportDefinition = {
  title: Trilingual;
  sub: Trilingual;
  /** The design's own grid template and the width it stops shrinking at. */
  columns: string;
  minWidth: string;
  head: readonly { label: Trilingual; align: Align }[];
  kpis: (days: number) => readonly ViewerKpi[];
  rows: (days: number) => readonly (readonly Cell[])[];
  note: Trilingual;
};

const MUTED = 'var(--fg-muted)';
const OK = 'var(--success-600)';
const BAD = 'var(--danger-600)';
const WARN = 'var(--warning-600)';

const L = (text: Trilingual | string, tone?: string): Cell => ({
  text,
  align: 'left',
  num: false,
  ...(tone === undefined ? {} : { tone }),
});

const N = (text: Trilingual | string, tone?: string): Cell => ({
  text,
  align: 'right',
  num: true,
  ...(tone === undefined ? {} : { tone }),
});

const M = (tiyin: number, tone?: string, prefix?: string): Cell => ({
  tiyin,
  align: 'right',
  num: true,
  ...(tone === undefined ? {} : { tone }),
  ...(prefix === undefined ? {} : { prefix }),
});

/* ------------------------------------------------------------- by waiter */

const WAITER_ROWS = [
  {
    name: 'Jasur Toshev',
    tickets: 68,
    guests: 214,
    sales: 1_840_000,
    average: 27_059,
    discount: 42_000,
    voids: 2,
  },
  {
    name: 'Malika Rahimova',
    tickets: 61,
    guests: 189,
    sales: 1_620_000,
    average: 26_557,
    discount: 38_000,
    voids: 1,
  },
  {
    name: 'Dilshod Karimov',
    tickets: 54,
    guests: 168,
    sales: 1_410_000,
    average: 26_111,
    discount: 61_000,
    voids: 4,
  },
  {
    name: 'Nodira Saidova',
    tickets: 49,
    guests: 152,
    sales: 1_280_000,
    average: 26_122,
    discount: 24_000,
    voids: 0,
  },
  {
    name: "Aziz Yo'ldoshev",
    tickets: 41,
    guests: 126,
    sales: 1_050_000,
    average: 25_610,
    discount: 18_000,
    voids: 3,
  },
  {
    name: 'Kamola Yusupova',
    tickets: 33,
    guests: 98,
    sales: 820_000,
    average: 24_848,
    discount: 12_000,
    voids: 2,
  },
] as const;

/* -------------------------------------------------------------- by dish */

const DISH_ROWS = [
  { name: "Osh, to'y oshi", category: 'Milliy', units: 214, price: 48_000, cost: 15_260 },
  { name: "Lag'mon, qovurma", category: 'Milliy', units: 168, price: 52_000, cost: 19_400 },
  { name: 'Chizburger', category: 'Burger', units: 142, price: 39_000, cost: 15_900 },
  { name: 'Margherita 30', category: 'Pizza', units: 96, price: 56_000, cost: 21_200 },
  { name: 'Tovuq lavash', category: 'Lavash', units: 188, price: 32_000, cost: 12_800 },
  { name: "Shashlik, qo'y", category: 'Milliy', units: 124, price: 46_000, cost: 21_400 },
  { name: 'Sezar salat', category: 'Salat', units: 62, price: 34_000, cost: 22_400 },
  { name: "Choy, ko'k", category: 'Ichimlik', units: 290, price: 8_000, cost: 1_100 },
] as const;

/* -------------------------------------------------------------- voids */

const VOID_STAGE = {
  draft: { label: { uz: 'Yuborilmagan', ru: 'Не отправлено', en: 'Not fired' }, tone: MUTED },
  sent: { label: { uz: 'Yuborilgan', ru: 'Отправлено', en: 'Fired' }, tone: WARN },
  cooking: { label: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Cooking' }, tone: BAD },
} as const;

const VOID_ROWS = [
  {
    time: '14:32',
    dish: "Osh, to'y oshi",
    who: 'Jasur T.',
    amount: 48_000,
    stage: 'sent' as const,
    reason: {
      uz: "Mijoz fikrini o'zgartirdi",
      ru: 'Гость передумал',
      en: 'Guest changed their mind',
    },
  },
  {
    time: '15:08',
    dish: 'Chizburger',
    who: 'Malika R.',
    amount: 39_000,
    stage: 'draft' as const,
    reason: { uz: 'Xato kiritildi', ru: 'Ошибка ввода', en: 'Entered by mistake' },
  },
  {
    time: '16:41',
    dish: "Shashlik, qo'y",
    who: 'Dilshod K.',
    amount: 46_000,
    stage: 'cooking' as const,
    reason: { uz: 'Xomashyo tugadi', ru: 'Закончилось сырьё', en: 'Ran out of stock' },
  },
  {
    time: '18:12',
    dish: 'Margherita 30',
    who: 'Nodira S.',
    amount: 56_000,
    stage: 'sent' as const,
    reason: {
      uz: 'Uzoq kutdi, mijoz ketdi',
      ru: 'Долго ждал, гость ушёл',
      en: 'Waited too long, guest left',
    },
  },
  {
    time: '19:26',
    dish: "Lag'mon",
    who: 'Jasur T.',
    amount: 52_000,
    stage: 'draft' as const,
    reason: { uz: 'Xato kiritildi', ru: 'Ошибка ввода', en: 'Entered by mistake' },
  },
  {
    time: '20:03',
    dish: 'Sezar salat',
    who: 'Aziz Y.',
    amount: 34_000,
    stage: 'cooking' as const,
    reason: {
      uz: 'Sifatsiz chiqdi',
      ru: 'Некачественно приготовлено',
      en: 'Came out badly',
    },
  },
] as const;

/* -------------------------------------------------------------- stock */

const MAIN: Trilingual = { uz: 'Asosiy', ru: 'Основной', en: 'Main' };
const BAR: Trilingual = { uz: 'Bar', ru: 'Бар', en: 'Bar' };
const KITCHEN: Trilingual = { uz: 'Oshxona', ru: 'Кухня', en: 'Kitchen' };

const STOCK_ROWS = [
  { name: "Mol go'shti", store: MAIN, opening: 18, in: 40, out: 46, closing: 12, unit: 92_000 },
  { name: 'Guruch, lazer', store: MAIN, opening: 62, in: 30, out: 44, closing: 48, unit: 14_000 },
  { name: 'Tovuq filesi', store: MAIN, opening: 24, in: 25, out: 30, closing: 19, unit: 58_000 },
  { name: 'Mozzarella', store: MAIN, opening: 12, in: 8, out: 13, closing: 7, unit: 78_000 },
  { name: 'Kola 0.5', store: BAR, opening: 120, in: 96, out: 120, closing: 96, unit: 6_200 },
  { name: 'Zaytun moyi', store: KITCHEN, opening: 18, in: 6, out: 10, closing: 14, unit: 92_000 },
] as const;

/* --------------------------------------------------------------- cash */

const CASH_ROWS = [
  {
    date: '15.08',
    what: { uz: 'Kunlik savdo tushumi', ru: 'Дневная выручка', en: 'Daily sales' },
    category: { uz: 'Savdo tushumi', ru: 'Выручка', en: 'Sales' },
    amount: 18_420_000,
  },
  {
    date: '15.08',
    what: {
      uz: "Farg'ona Meat — go'sht",
      ru: 'Фаргона Мит — мясо',
      en: "Farg'ona Meat — beef",
    },
    category: { uz: 'Xomashyo', ru: 'Сырьё', en: 'Raw materials' },
    amount: -2_840_000,
  },
  {
    date: '15.08',
    what: { uz: 'Inkassatsiya — bankka', ru: 'Инкассация в банк', en: 'Cash drop to bank' },
    category: { uz: "Pul o'tqazmasi", ru: 'Перевод', en: 'Transfer' },
    amount: -12_000_000,
  },
  {
    date: '16.08',
    what: {
      uz: "Nilufar Y. — qarz to'lovi",
      ru: 'Нилуфар Ю. — погашение',
      en: 'Nilufar Y. — repayment',
    },
    category: { uz: "Qarz to'lovi", ru: 'Погашение долга', en: 'Debt repayment' },
    amount: 480_000,
  },
  {
    date: '16.08',
    what: {
      uz: 'Kommunal — avgust',
      ru: 'Коммунальные — август',
      en: 'Utilities — August',
    },
    category: { uz: 'Kommunal', ru: 'Коммунальные', en: 'Utilities' },
    amount: -1_180_000,
  },
  {
    date: '16.08',
    what: {
      uz: 'Maosh avansi — 12 xodim',
      ru: 'Аванс — 12 сотрудников',
      en: 'Payroll advance — 12 staff',
    },
    category: { uz: 'Maosh', ru: 'Зарплата', en: 'Payroll' },
    amount: -4_800_000,
  },
  {
    date: '17.08',
    what: { uz: 'Kunlik savdo tushumi', ru: 'Дневная выручка', en: 'Daily sales' },
    category: { uz: 'Savdo tushumi', ru: 'Выручка', en: 'Sales' },
    amount: 16_240_000,
  },
] as const;

/**
 * The design's own sample table for a viewer, where the design drew one.
 *
 * PARTIAL, and deliberately so. Five of the nine reports have a fixture because
 * the handoff drew five viewers; the four that were added when the API learned
 * to answer them have none, and inventing a demo table for a VAT return or a
 * branch comparison would be putting figures on the screen an accountant reads
 * before the server has said anything. Those four draw nothing until the live
 * answer lands — see `Viewer` in `reports-panels.tsx`.
 */
export const REPORT_DEFINITIONS: Partial<Readonly<Record<ReportId, ReportDefinition>>> = {
  waiters: {
    title: {
      uz: "Ofitsiantlar bo'yicha hisobot",
      ru: 'Отчёт по официантам',
      en: 'Report by waiter',
    },
    sub: {
      uz: "Kim qancha sotdi, o'rtacha cheki qancha, qancha chegirma berdi",
      ru: 'Кто сколько продал, какой средний чек, сколько скидок дал',
      en: 'Who sold how much, at what average ticket, with how much discount',
    },
    columns: 'minmax(160px,1.4fr) 90px 96px 120px 110px 110px 96px',
    minWidth: '860px',
    head: [
      { label: { uz: 'Ofitsiant', ru: 'Официант', en: 'Waiter' }, align: 'left' },
      { label: { uz: 'Cheklar', ru: 'Чеков', en: 'Tickets' }, align: 'right' },
      { label: { uz: 'Mehmon', ru: 'Гостей', en: 'Guests' }, align: 'right' },
      { label: { uz: 'Summa', ru: 'Сумма', en: 'Sales' }, align: 'right' },
      { label: { uz: "O'rtacha", ru: 'Средний', en: 'Average' }, align: 'right' },
      { label: { uz: 'Chegirma', ru: 'Скидка', en: 'Discount' }, align: 'right' },
      { label: { uz: 'Bekor', ru: 'Отмены', en: 'Voids' }, align: 'right' },
    ],
    kpis: (days) => [
      {
        label: { uz: 'Jami savdo', ru: 'Всего продаж', en: 'Total sales' },
        tiyin: som(4_820_000 * days),
        delta: { uz: '6 ofitsiant', ru: '6 официантов', en: '6 waiters' },
        tone: 'var(--fg-subtle)',
      },
      {
        label: { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Average ticket' },
        tiyin: som(95_900),
        delta: '+3.2%',
        tone: OK,
      },
      {
        label: { uz: 'Chegirma ulushi', ru: 'Доля скидок', en: 'Discount share' },
        text: '2.8%',
        delta: { uz: "me'yor 3%", ru: 'норма 3%', en: 'target 3%' },
        tone: 'var(--fg-subtle)',
      },
      {
        label: { uz: 'Bekor qilingan', ru: 'Отменено', en: 'Voided' },
        tiyin: scale(184_000, days),
        delta: { uz: '12 ta chek', ru: '12 чеков', en: '12 tickets' },
        tone: BAD,
      },
    ],
    rows: (days) =>
      WAITER_ROWS.map((row) => [
        L(row.name),
        N(String(row.tickets)),
        N(String(row.guests)),
        M(scale(row.sales, days)),
        M(som(row.average), MUTED),
        M(scale(row.discount, days), WARN),
        N(String(row.voids), row.voids > 2 ? BAD : MUTED),
      ]),
    note: {
      uz: 'Chegirma ulushi 5% dan oshsa Nazorat modulida belgilanadi. Bekor qilish soni ofitsiantning risk balliga kiradi.',
      ru: 'Доля скидок выше 5% отмечается в модуле контроля. Количество отмен влияет на риск-балл официанта.',
      en: "A discount share above 5% is flagged in Loss prevention. Void counts feed the waiter's risk score.",
    },
  },

  dishes: {
    title: { uz: "Taomlar bo'yicha hisobot", ru: 'Отчёт по блюдам', en: 'Report by dish' },
    sub: {
      uz: 'Nechta sotildi, qancha tannarx, qancha foyda qoldi',
      ru: 'Сколько продано, какая себестоимость, сколько прибыли',
      en: 'Units sold, cost, and the profit left',
    },
    columns: 'minmax(180px,1.6fr) 120px 88px 110px 110px 100px 96px',
    minWidth: '900px',
    head: [
      { label: { uz: 'Taom', ru: 'Блюдо', en: 'Dish' }, align: 'left' },
      { label: { uz: 'Kategoriya', ru: 'Категория', en: 'Category' }, align: 'left' },
      { label: { uz: 'Soni', ru: 'Кол-во', en: 'Units' }, align: 'right' },
      { label: { uz: 'Savdo', ru: 'Продажи', en: 'Sales' }, align: 'right' },
      { label: { uz: 'Tannarx', ru: 'Себест.', en: 'Cost' }, align: 'right' },
      { label: { uz: 'Foyda', ru: 'Прибыль', en: 'Profit' }, align: 'right' },
      { label: { uz: 'Marja', ru: 'Маржа', en: 'Margin' }, align: 'right' },
    ],
    kpis: (days) => [
      {
        label: { uz: 'Sotilgan taomlar', ru: 'Продано блюд', en: 'Dishes sold' },
        text: String(Math.round((1_284 * days) / 30)),
        delta: { uz: '34 pozitsiya', ru: '34 позиции', en: '34 items' },
        tone: 'var(--fg-subtle)',
      },
      {
        label: { uz: 'Yalpi foyda', ru: 'Валовая прибыль', en: 'Gross profit' },
        tiyin: scale(11_260_000, days),
        delta: '61.1%',
        tone: OK,
      },
      {
        label: { uz: 'Eng foydali', ru: 'Самое прибыльное', en: 'Best margin' },
        text: plain("Osh, to'y"),
        delta: '68.2%',
        tone: OK,
      },
      {
        label: { uz: 'Eng zaif', ru: 'Самое слабое', en: 'Weakest' },
        text: plain('Sezar'),
        delta: '34.1%',
        tone: BAD,
      },
    ],
    rows: (days) =>
      DISH_ROWS.map((row) => {
        const units = Math.round((row.units * days) / 30);
        const sales = som(units * row.price);
        const cost = som(units * row.cost);
        const profit = sales - cost;
        const margin = sales > 0 ? (profit / sales) * 100 : 0;

        return [
          L(row.name),
          L(plain(row.category), MUTED),
          N(String(units)),
          M(sales),
          M(cost, MUTED),
          M(profit),
          N(`${margin.toFixed(1)}%`, margin >= 60 ? OK : margin >= 45 ? 'var(--fg)' : BAD),
        ];
      }),
    note: {
      uz: 'Marja 45% dan past taomlar Menyu rentabelligida “itlar” kvadrantiga tushadi — narxni ko’tarish yoki retseptni qayta ko’rib chiqish kerak.',
      ru: 'Блюда с маржой ниже 45% попадают в квадрант “собаки” в анализе меню — нужно поднять цену или пересмотреть рецепт.',
      en: 'Dishes below 45% margin land in the “dogs” quadrant of menu profitability — raise the price or rework the recipe.',
    },
  },

  voids: {
    title: {
      uz: 'Bekor qilingan taomlar hisoboti',
      ru: 'Отчёт по отменённым блюдам',
      en: 'Voided items report',
    },
    sub: {
      uz: 'Nima bekor qilindi, kim qildi, qaysi sabab bilan',
      ru: 'Что отменено, кем и по какой причине',
      en: 'What was voided, by whom, and why',
    },
    columns: '96px minmax(150px,1.3fr) minmax(120px,1fr) 110px 100px minmax(140px,1.2fr)',
    minWidth: '880px',
    head: [
      { label: { uz: 'Vaqt', ru: 'Время', en: 'Time' }, align: 'left' },
      { label: { uz: 'Taom', ru: 'Блюдо', en: 'Dish' }, align: 'left' },
      { label: { uz: 'Kim', ru: 'Кто', en: 'Who' }, align: 'left' },
      { label: { uz: 'Summa', ru: 'Сумма', en: 'Amount' }, align: 'right' },
      { label: { uz: 'Bosqich', ru: 'Этап', en: 'Stage' }, align: 'left' },
      { label: { uz: 'Sabab', ru: 'Причина', en: 'Reason' }, align: 'left' },
    ],
    kpis: (days) => [
      {
        label: { uz: 'Bekor qilingan', ru: 'Отменено', en: 'Voided' },
        text: String(Math.round((12 * days) / 30) || 12),
        delta: { uz: 'cheklar soni', ru: 'чеков', en: 'tickets' },
        tone: BAD,
      },
      {
        label: { uz: 'Summa', ru: 'Сумма', en: 'Amount' },
        tiyin: scale(184_000, days),
        delta: { uz: 'savdodan 1.0%', ru: '1.0% от продаж', en: '1.0% of sales' },
        tone: BAD,
      },
      {
        label: { uz: 'Yuborilgandan keyin', ru: 'После отправки', en: 'After firing' },
        text: '4',
        delta: {
          uz: "menejer tasdig'i bilan",
          ru: 'с согласия менеджера',
          en: 'manager approved',
        },
        tone: WARN,
      },
      {
        label: { uz: "Eng ko'p sabab", ru: 'Частая причина', en: 'Top reason' },
        text: { uz: 'Mijoz fikri', ru: 'Гость передумал', en: 'Guest changed' },
        delta: { uz: '5 marta', ru: '5 раз', en: '5 times' },
        tone: 'var(--fg-subtle)',
      },
    ],
    rows: () =>
      VOID_ROWS.map((row) => {
        const stage = VOID_STAGE[row.stage];

        return [
          { text: row.time, align: 'left' as const, num: true, tone: MUTED },
          L(row.dish),
          L(row.who, MUTED),
          M(som(row.amount)),
          L(stage.label, stage.tone),
          L(row.reason, MUTED),
        ];
      }),
    note: {
      uz: "Yuborilgandan keyin bekor qilish menejer tasdig'ini talab qiladi va xomashyo qaytarilmaydi — taom allaqachon tayyorlangan. Bu qator Nazorat modulida ham ko'rinadi.",
      ru: 'Отмена после отправки требует согласования менеджера, сырьё не возвращается — блюдо уже приготовлено. Эта строка также видна в модуле контроля.',
      en: 'Voiding after firing needs manager approval and the stock is not returned — the dish is already made. The same row appears in Loss prevention.',
    },
  },

  stock: {
    title: { uz: "Qoldiq bo'yicha hisobot", ru: 'Отчёт по остаткам', en: 'Stock report' },
    sub: {
      uz: "Boshlang'ich qoldiq, kirim, sarf, oxirgi qoldiq — har bir pozitsiya bo'yicha",
      ru: 'Начальный остаток, приход, расход, конечный остаток по каждой позиции',
      en: 'Opening, in, out and closing balance for every line',
    },
    columns: 'minmax(170px,1.5fr) 100px 96px 96px 96px 110px 110px',
    minWidth: '900px',
    head: [
      { label: { uz: 'Pozitsiya', ru: 'Позиция', en: 'Item' }, align: 'left' },
      { label: { uz: 'Ombor', ru: 'Склад', en: 'Store' }, align: 'left' },
      { label: { uz: 'Boshi', ru: 'Начало', en: 'Opening' }, align: 'right' },
      { label: { uz: 'Kirim', ru: 'Приход', en: 'In' }, align: 'right' },
      { label: { uz: 'Sarf', ru: 'Расход', en: 'Out' }, align: 'right' },
      { label: { uz: 'Oxiri', ru: 'Конец', en: 'Closing' }, align: 'right' },
      { label: { uz: 'Summa', ru: 'Сумма', en: 'Value' }, align: 'right' },
    ],
    kpis: (days) => [
      {
        label: { uz: 'Ombor qiymati', ru: 'Стоимость склада', en: 'Stock value' },
        tiyin: som(18_640_000),
        delta: { uz: '142 pozitsiya', ru: '142 позиции', en: '142 lines' },
        tone: 'var(--fg-subtle)',
      },
      {
        label: { uz: 'Kirim', ru: 'Приход', en: 'Received' },
        tiyin: scale(8_420_000, days),
        delta: { uz: '14 yetkazish', ru: '14 поставок', en: '14 deliveries' },
        tone: 'var(--fg-subtle)',
      },
      {
        label: { uz: 'Sarf', ru: 'Расход', en: 'Consumed' },
        tiyin: scale(7_180_000, days),
        delta: { uz: "retsept bo'yicha", ru: 'по рецептам', en: 'per recipe' },
        tone: 'var(--fg-subtle)',
      },
      {
        label: { uz: 'Chiqindi', ru: 'Списание', en: 'Waste' },
        tiyin: scale(184_000, days),
        delta: '1.2%',
        tone: WARN,
      },
    ],
    rows: () =>
      STOCK_ROWS.map((row) => [
        L(row.name),
        L(row.store, MUTED),
        N(String(row.opening), MUTED),
        N(`+${row.in}`, OK),
        N(`−${row.out}`, BAD),
        N(String(row.closing)),
        M(som(row.closing * row.unit)),
      ]),
    note: {
      uz: "Sarf retsept bo'yicha avtomatik hisoblanadi. Inventarizatsiya farqi 5% dan oshsa qator qizil bo'ladi va menejer tasdig'i so'raladi.",
      ru: 'Расход считается автоматически по рецептам. При расхождении инвентаризации свыше 5% строка краснеет и запрашивается согласование менеджера.',
      en: 'Consumption is computed from recipes. A stock-count variance above 5% turns the row red and asks for manager approval.',
    },
  },

  cash: {
    title: { uz: 'Pul oqimi hisoboti', ru: 'Отчёт о движении денег', en: 'Cash flow report' },
    sub: {
      uz: 'Kassa, bank va qarz bo’yicha pul harakati',
      ru: 'Движение денег по кассе, банку и долгам',
      en: 'Money movement across till, bank and credit',
    },
    columns: '110px minmax(180px,1.6fr) minmax(120px,1fr) 120px 130px',
    minWidth: '760px',
    head: [
      { label: { uz: 'Sana', ru: 'Дата', en: 'Date' }, align: 'left' },
      { label: { uz: 'Izoh', ru: 'Описание', en: 'Description' }, align: 'left' },
      { label: { uz: 'Toifa', ru: 'Категория', en: 'Category' }, align: 'left' },
      { label: { uz: 'Summa', ru: 'Сумма', en: 'Amount' }, align: 'right' },
      { label: { uz: 'Qoldiq', ru: 'Остаток', en: 'Balance' }, align: 'right' },
    ],
    kpis: (days) => [
      {
        label: { uz: 'Kirim', ru: 'Поступления', en: 'Money in' },
        tiyin: scale(20_300_000, days),
        delta: {
          uz: "savdo va qarz to'lovi",
          ru: 'продажи и погашение долга',
          en: 'sales and repayments',
        },
        tone: OK,
      },
      {
        label: { uz: 'Chiqim', ru: 'Расходы', en: 'Money out' },
        tiyin: scale(13_120_000, days),
        delta: {
          uz: 'xomashyo, ijara, maosh',
          ru: 'сырьё, аренда, зарплата',
          en: 'stock, rent, payroll',
        },
        tone: BAD,
      },
      {
        label: { uz: 'Sof oqim', ru: 'Чистый поток', en: 'Net flow' },
        tiyin: scale(7_180_000, days),
        delta: '+12.4%',
        tone: OK,
      },
      {
        label: { uz: 'Kassadagi qoldiq', ru: 'Остаток в кассе', en: 'Cash on hand' },
        tiyin: som(3_840_000),
        delta: { uz: 'smena oxirida', ru: 'на конец смены', en: 'end of shift' },
        tone: 'var(--fg-subtle)',
      },
    ],
    rows: () => {
      let balance = som(2_400_000);

      return CASH_ROWS.map((row) => {
        balance += som(row.amount);

        return [
          { text: row.date, align: 'left' as const, num: true, tone: MUTED },
          L(row.what),
          L(row.category, MUTED),
          M(som(Math.abs(row.amount)), row.amount > 0 ? OK : BAD, row.amount > 0 ? '+' : '−'),
          M(balance, MUTED),
        ];
      });
    },
    note: {
      uz: "Pul oqimi tushumdan farq qiladi: qarzga sotilgan chek tushumga kiradi, lekin pul kelmaydi. Qarz to'langanda esa pul keladi, lekin bu yangi sotuv emas.",
      ru: 'Денежный поток отличается от выручки: чек в долг попадает в выручку, но деньги не приходят. При погашении деньги приходят, но это не новая продажа.',
      en: 'Cash flow differs from revenue: a credit ticket counts as revenue but brings no money; a repayment brings money but is not a new sale.',
    },
  },
};

/* ============================================================
   The custom-report builder and the schedule sheet
   ============================================================ */

export type BuilderBase = 'sales' | 'fin' | 'stock' | 'staff';

export const BUILDER_BASES: readonly {
  key: BuilderBase;
  label: Trilingual;
  note: Trilingual;
}[] = [
  {
    key: 'sales',
    label: { uz: 'Sotuv', ru: 'Продажи', en: 'Sales' },
    note: {
      uz: 'Buyurtma, chek, taom, kanal',
      ru: 'Заказы, чеки, блюда, каналы',
      en: 'Orders, tickets, dishes, channels',
    },
  },
  {
    key: 'fin',
    label: { uz: 'Moliya', ru: 'Финансы', en: 'Finance' },
    note: {
      uz: 'Tushum, xarajat, foyda, QQS',
      ru: 'Выручка, расходы, прибыль, НДС',
      en: 'Revenue, expenses, profit, VAT',
    },
  },
  {
    key: 'stock',
    label: { uz: 'Ombor', ru: 'Склад', en: 'Stock' },
    note: {
      uz: 'Qoldiq, chiqim, chiqindi, tannarx',
      ru: 'Остатки, расход, списание, себестоимость',
      en: 'Balances, usage, waste, cost',
    },
  },
  {
    key: 'staff',
    label: { uz: 'Xodimlar', ru: 'Сотрудники', en: 'Staff' },
    note: {
      uz: 'Smena, soat, sotuv, mehnat xarajati',
      ru: 'Смены, часы, продажи, ФОТ',
      en: 'Shifts, hours, sales, labour cost',
    },
  },
];

export const BUILDER_COLUMNS: Readonly<Record<BuilderBase, readonly Trilingual[]>> = {
  sales: [
    { uz: 'Sana', ru: 'Дата', en: 'Date' },
    { uz: 'Filial', ru: 'Филиал', en: 'Branch' },
    { uz: 'Kanal', ru: 'Канал', en: 'Channel' },
    { uz: 'Buyurtma', ru: 'Заказы', en: 'Orders' },
    { uz: 'Tushum', ru: 'Выручка', en: 'Revenue' },
    { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Avg ticket' },
    { uz: 'Chegirma', ru: 'Скидки', en: 'Discounts' },
  ],
  fin: [
    { uz: 'Sana', ru: 'Дата', en: 'Date' },
    { uz: 'Filial', ru: 'Филиал', en: 'Branch' },
    { uz: 'Tushum', ru: 'Выручка', en: 'Revenue' },
    { uz: 'Xarajat', ru: 'Расходы', en: 'Expenses' },
    { uz: 'Yalpi foyda', ru: 'Валовая прибыль', en: 'Gross profit' },
    { uz: 'QQS', ru: 'НДС', en: 'VAT' },
    { uz: 'Sof foyda', ru: 'Чистая прибыль', en: 'Net profit' },
  ],
  stock: [
    { uz: 'Sana', ru: 'Дата', en: 'Date' },
    { uz: 'Mahsulot', ru: 'Товар', en: 'Item' },
    { uz: "Boshlang'ich", ru: 'Начальный', en: 'Opening' },
    { uz: 'Kirim', ru: 'Приход', en: 'In' },
    { uz: 'Chiqim', ru: 'Расход', en: 'Out' },
    { uz: 'Chiqindi', ru: 'Списание', en: 'Waste' },
    { uz: 'Qoldiq', ru: 'Остаток', en: 'Closing' },
  ],
  staff: [
    { uz: 'Xodim', ru: 'Сотрудник', en: 'Employee' },
    { uz: 'Rol', ru: 'Роль', en: 'Role' },
    { uz: 'Smena', ru: 'Смены', en: 'Shifts' },
    { uz: 'Soat', ru: 'Часы', en: 'Hours' },
    { uz: 'Sotuv', ru: 'Продажи', en: 'Sales' },
    { uz: 'Choypuli', ru: 'Чаевые', en: 'Tips' },
    { uz: 'Mehnat %', ru: 'ФОТ %', en: 'Labour %' },
  ],
};

export type BuilderGroup = 'day' | 'week' | 'month' | 'branch';

export const BUILDER_GROUPS: readonly { key: BuilderGroup; label: Trilingual }[] = [
  { key: 'day', label: { uz: 'Kun', ru: 'День', en: 'Day' } },
  { key: 'week', label: { uz: 'Hafta', ru: 'Неделя', en: 'Week' } },
  { key: 'month', label: { uz: 'Oy', ru: 'Месяц', en: 'Month' } },
  { key: 'branch', label: { uz: 'Filial', ru: 'Филиал', en: 'Branch' } },
];

/** How many rows each grouping produces. `ROWCOUNT`, `:13800`. */
export const BUILDER_ROWS: Readonly<Record<BuilderGroup, number>> = {
  day: 11,
  week: 6,
  month: 8,
  branch: 5,
};

export const SCHEDULE_FREQUENCIES: readonly {
  key: string;
  label: Trilingual;
  note: Trilingual;
}[] = [
  {
    key: 'daily',
    label: { uz: 'Har kuni', ru: 'Каждый день', en: 'Daily' },
    note: {
      uz: '06:30 · ish kuni yopilgandan keyin',
      ru: '06:30 · после закрытия дня',
      en: '06:30 · after the business day closes',
    },
  },
  {
    key: 'weekly',
    label: { uz: 'Har hafta', ru: 'Каждую неделю', en: 'Weekly' },
    note: { uz: 'Dushanba 08:00', ru: 'Понедельник 08:00', en: 'Monday 08:00' },
  },
  {
    key: 'monthly',
    label: { uz: 'Har oy', ru: 'Каждый месяц', en: 'Monthly' },
    note: { uz: 'Oyning 1-kuni 09:00', ru: '1-го числа 09:00', en: '1st of the month, 09:00' },
  },
  {
    key: 'quarter',
    label: { uz: 'Har chorak', ru: 'Каждый квартал', en: 'Quarterly' },
    note: {
      uz: 'Chorak yopilgandan keyin',
      ru: 'После закрытия квартала',
      en: 'After the quarter closes',
    },
  },
];

export const SCHEDULE_DESTINATIONS: readonly {
  key: string;
  label: Trilingual;
  note: Trilingual;
  on: boolean;
}[] = [
  {
    key: 'mail',
    label: { uz: 'Elektron pochta', ru: 'Электронная почта', en: 'Email' },
    note: plain('rustam@smartrestaurant.uz'),
    on: true,
  },
  {
    key: 'tg',
    label: { uz: 'Telegram', ru: 'Telegram', en: 'Telegram' },
    note: plain('@rustam_k'),
    on: false,
  },
  {
    key: 'drive',
    label: { uz: 'Bulutli saqlash', ru: 'Облачное хранилище', en: 'Cloud storage' },
    note: { uz: 'papkaga', ru: 'в папку', en: 'to folder' },
    on: false,
  },
];

/* ============================================================
   Chrome and confirmations
   ============================================================ */

export const REPORTS_UI = {
  custom: { uz: "O'z hisobotini yig'ish", ru: 'Собрать свой отчёт', en: 'Build custom report' },
  runNow: { uz: 'Hozir ishga tushirish', ru: 'Запустить сейчас', en: 'Run now' },
  schedule: { uz: 'Jadval', ru: 'Расписание', en: 'Schedule' },
  back: { uz: 'Hisobotlar', ru: 'Отчёты', en: 'Reports' },
  print: { uz: 'Chop etish', ru: 'Печать', en: 'Print' },
  export: { uz: 'Eksport', ru: 'Экспорт', en: 'Export' },
  cancel: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },

  builderTitle: { uz: 'Hisobot yaratish', ru: 'Создать отчёт', en: 'Build a report' },
  builderSub: {
    uz: "Manba, ustunlar va guruhlashni tanlaysiz — natija darhol ko'rinadi.",
    ru: 'Выберите источник, колонки и группировку — результат виден сразу.',
    en: 'Pick a source, the columns and the grouping — the result is shown immediately.',
  },
  labelBase: { uz: 'Manba', ru: 'Источник', en: 'Source' },
  labelColumns: { uz: 'Ustunlar', ru: 'Колонки', en: 'Columns' },
  labelGroup: { uz: 'Guruhlash', ru: 'Группировка', en: 'Group by' },
  labelPreview: { uz: "Natija ko'rinishi", ru: 'Предпросмотр', en: 'Preview' },
  runReport: { uz: 'Hisobotni olish', ru: 'Получить отчёт', en: 'Run the report' },
  noColumns: {
    uz: 'Ustun tanlanmagan',
    ru: 'Колонки не выбраны',
    en: 'No columns selected',
  },
  needColumn: {
    uz: 'Kamida bitta ustun kerak',
    ru: 'Нужна хотя бы одна колонка',
    en: 'At least one column is needed',
  },

  scheduleTitle: {
    uz: "Hisobotni jadvalga qo'yish",
    ru: 'Расписание отчёта',
    en: 'Schedule a report',
  },
  scheduleSub: {
    uz: 'Hisobot avtomatik yaratiladi va tanlangan manzilga yuboriladi.',
    ru: 'Отчёт будет создаваться автоматически и отправляться по выбранным адресам.',
    en: 'The report is built automatically and sent to the destinations you pick.',
  },
  labelWhen: { uz: 'Qachon', ru: 'Когда', en: 'When' },
  labelTo: { uz: 'Kimga', ru: 'Куда', en: 'Where to' },
  scheduleSave: {
    uz: "Jadvalga qo'yish",
    ru: 'Поставить в расписание',
    en: 'Schedule it',
  },
  scheduleNote: {
    uz: "Jadvalga qo'yilgan hisobot Sozlamalarda o'chiriladi. Ish kuni 06:00 da yopiladi, shuning uchun kunlik hisobot 06:30 da yuboriladi.",
    ru: 'Расписание отключается в Настройках. Рабочий день закрывается в 06:00, поэтому дневной отчёт уходит в 06:30.',
    en: 'Schedules are switched off in Settings. The business day closes at 06:00, so the daily report goes out at 06:30.',
  },

  rowsWord: { uz: 'qator', ru: 'строк', en: 'rows' },
  columnsWord: { uz: 'ustun', ru: 'колонок', en: 'columns' },
  showing: { uz: "Ko'rsatilgan: ", ru: 'Показано: ', en: 'Showing ' },
} as const satisfies Readonly<Record<string, Trilingual>>;

export const REPORTS_COPY = {
  queued: {
    uz: 'tayyorlanmoqda · pochtaga yuboriladi',
    ru: 'готовится · будет отправлен на почту',
    en: 'building · it will be emailed to you',
  },
  sentToPrinter: {
    uz: 'chop etishga yuborildi',
    ru: 'отправлен на печать',
    en: 'sent to the printer',
  },
  pickAColumn: {
    uz: 'Kamida bitta ustun tanlang',
    ru: 'Выберите хотя бы одну колонку',
    en: 'Select at least one column',
  },
  builtRows: {
    uz: "qator tayyor · Excel'ga eksport qilishga tayyor",
    ru: 'строк готово · можно экспортировать в Excel',
    en: 'rows ready · you can export to Excel',
  },
  pickADestination: {
    uz: 'Kamida bitta manzil tanlang',
    ru: 'Выберите хотя бы один адрес',
    en: 'Pick at least one destination',
  },
  destinations: { uz: 'manzilga yuboriladi', ru: 'адресам', en: 'destinations' },
  scheduled: { uz: "jadvalga qo'yildi", ru: 'в расписании', en: 'scheduled' },
  /*
   * What the viewer says when the server refused the report rather than
   * answering an empty one.
   *
   * It used to say nothing: `fetchReport()` returns null for "not available"
   * — which is exactly what a restaurant with no trading data gets — and the
   * viewer fell through to `REPORT_DEFINITIONS`' sample table, row count and
   * all. Opening "Sales by day" on a restaurant that has sold nothing showed a
   * full table of invented figures with an Export button beside it.
   */
  noData: {
    uz: "Tanlangan davr uchun bu hisobotda ma'lumot yo'q",
    ru: 'За выбранный период по этому отчёту данных нет',
    en: 'This report has no data for the chosen period',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

/* ============================================================
   Column headings
   ============================================================ */

/**
 * A column header a person can read.
 *
 * The API's keys are stable identifiers (`revenue_tiyin`, `cancelled_lines`)
 * and are deliberately NOT translated server-side — an API that answered in
 * Uzbek could only ever be read in Uzbek, and fourteen surfaces read this one.
 * The mapping is small, closed, and lives here rather than beside the fetcher
 * because it has two readers now: the report viewer on screen, and the printable
 * report sheet at `/documents?d=report`. The same column printed under two
 * different words on the screen and on the paper is the disagreement that is
 * always found by the person who trusted the paper.
 */
const HEADINGS: Record<string, Record<Lang, string>> = {
  name: { uz: 'Xodim', ru: 'Сотрудник', en: 'Staff' },
  paid_bills: { uz: 'Cheklar', ru: 'Чеков', en: 'Tickets' },
  revenue_tiyin: { uz: 'Summa', ru: 'Сумма', en: 'Sales' },
  average_cheque_tiyin: { uz: "O'rtacha", ru: 'Средний', en: 'Average' },
  discounts_tiyin: { uz: 'Chegirma', ru: 'Скидка', en: 'Discount' },
  voided_bills: { uz: 'Bekor', ru: 'Отмены', en: 'Voids' },
  cancelled_lines: { uz: "O'chirilgan", ru: 'Удалено', en: 'Deleted' },
  sku: { uz: 'Kod', ru: 'Код', en: 'SKU' },
  title: { uz: 'Taom', ru: 'Блюдо', en: 'Dish' },
  sold: { uz: 'Sotildi', ru: 'Продано', en: 'Sold' },
  cost_tiyin: { uz: 'Tannarx', ru: 'Себестоимость', en: 'Cost' },
  profit_tiyin: { uz: 'Foyda', ru: 'Прибыль', en: 'Profit' },
  margin_percent: { uz: 'Marja', ru: 'Маржа', en: 'Margin' },
  at: { uz: 'Vaqt', ru: 'Время', en: 'Time' },
  order_number: { uz: 'Chek', ru: 'Чек', en: 'Ticket' },
  table_label: { uz: 'Stol', ru: 'Стол', en: 'Table' },
  waiter: { uz: 'Ofitsiant', ru: 'Официант', en: 'Waiter' },
  quantity: { uz: 'Soni', ru: 'Кол-во', en: 'Qty' },
  total_price: { uz: 'Summa', ru: 'Сумма', en: 'Amount' },
  note: { uz: 'Izoh', ru: 'Комментарий', en: 'Note' },
  direction: { uz: "Yo'nalish", ru: 'Направление', en: 'Direction' },
  label: { uz: 'Nima', ru: 'Что', en: 'What' },
  count: { uz: 'Soni', ru: 'Кол-во', en: 'Count' },
  amount_tiyin: { uz: 'Summa', ru: 'Сумма', en: 'Amount' },
  fee_tiyin: { uz: 'Komissiya', ru: 'Комиссия', en: 'Fee' },
  /* The Z pack. */
  number: { uz: 'Smena', ru: 'Смена', en: 'Shift' },
  opened_at: { uz: 'Ochildi', ru: 'Открыта', en: 'Opened' },
  closed_at: { uz: 'Yopildi', ru: 'Закрыта', en: 'Closed' },
  takings_tiyin: { uz: 'Tushum', ru: 'Выручка', en: 'Takings' },
  expected_cash_tiyin: { uz: 'Kutilgan', ru: 'Ожидалось', en: 'Expected' },
  counted_cash_tiyin: { uz: 'Sanaldi', ru: 'Посчитано', en: 'Counted' },
  difference_tiyin: { uz: 'Farq', ru: 'Разница', en: 'Difference' },
  /* Sales by item. */
  category: { uz: 'Kategoriya', ru: 'Категория', en: 'Category' },
  /* The VAT pack. */
  date: { uz: 'Sana', ru: 'Дата', en: 'Date' },
  receipts: { uz: 'Cheklar', ru: 'Чеков', en: 'Receipts' },
  gross_tiyin: { uz: 'QQS bilan', ru: 'С НДС', en: 'Gross' },
  net_tiyin: { uz: 'QQSsiz', ru: 'Без НДС', en: 'Net' },
  vat_tiyin: { uz: 'QQS', ru: 'НДС', en: 'VAT' },
  /* The branch comparison. */
  orders_count: { uz: 'Buyurtma', ru: 'Заказов', en: 'Orders' },
  guests_count: { uz: 'Mehmon', ru: 'Гостей', en: 'Guests' },
  labour_percent: { uz: 'Mehnat', ru: 'Труд', en: 'Labour' },
  food_cost_percent: { uz: 'Food cost', ru: 'Food cost', en: 'Food cost' },
  staff_count: { uz: 'Xodim', ru: 'Сотрудников', en: 'Staff' },
};

export function heading(key: string, lang: Lang): string {
  return HEADINGS[key]?.[lang] ?? key;
}
