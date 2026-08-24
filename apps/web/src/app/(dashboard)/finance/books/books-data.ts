/**
 * Bookkeeping — five tabs, `specs/01-os.md §5.17`.
 *
 * The month's paperwork: what was spent, who is owed and who owes, what payroll
 * costs, whether the month can be locked, and the filings that follow.
 *
 * Two things on this screen are the reason it exists rather than being a view
 * of Finance:
 *
 *   **Reconciliation.** Every till and every terminal has a number the system
 *   believes and a number the bank or the drawer actually holds. The month is
 *   not closed because somebody pressed close; it is closed because those four
 *   pairs agree, or because the difference has been explained.
 *
 *   **Closing locks.** A closed month stops accepting edits. That is the whole
 *   control — without it, last quarter's profit changes every time somebody
 *   backdates an invoice, and a signed P&L means nothing.
 *
 * Fixtures. `finance.expenses` exists and is seeded; payables, payroll, period
 * state, reconciliation and the filings have no tables at all.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/* -------------------------------------------------------------- expenses */

/** The seven the design's add form offers. A closed set, so the breakdown works. */
export type ExpenseCategory =
  'rent' | 'utilities' | 'payroll' | 'food' | 'marketing' | 'repairs' | 'other';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'rent',
  'utilities',
  'payroll',
  'food',
  'marketing',
  'repairs',
  'other',
];

export type Expense = {
  id: string;
  date: string;
  category: ExpenseCategory;
  note: Trilingual;
  /** Tiyin. */
  amount: number;
  paid: boolean;
};

export const EXPENSES: readonly Expense[] = [
  {
    id: 'e1',
    date: '01.08',
    category: 'rent',
    note: {
      uz: 'Chilonzor · avgust ijarasi',
      ru: 'Чиланзар · аренда за август',
      en: 'Chilonzor · August rent',
    },
    amount: som(28_000_000),
    paid: true,
  },
  {
    id: 'e2',
    date: '03.08',
    category: 'utilities',
    note: {
      uz: 'Elektr va suv · iyul',
      ru: 'Электричество и вода · июль',
      en: 'Power and water · July',
    },
    amount: som(6_420_000),
    paid: false,
  },
  {
    id: 'e3',
    date: '05.08',
    category: 'marketing',
    note: { uz: 'Instagram reklama', ru: 'Реклама в Instagram', en: 'Instagram ads' },
    amount: som(3_200_000),
    paid: true,
  },
  {
    id: 'e4',
    date: '07.08',
    category: 'repairs',
    note: {
      uz: "Muzlatkich ta'miri · Sergeli",
      ru: 'Ремонт холодильника · Сергели',
      en: 'Fridge repair · Sergeli',
    },
    amount: som(1_850_000),
    paid: false,
  },
  {
    id: 'e5',
    date: '08.08',
    category: 'other',
    note: {
      uz: 'Litsenziya va ruxsatnomalar',
      ru: 'Лицензии и разрешения',
      en: 'Licences and permits',
    },
    amount: som(2_400_000),
    paid: true,
  },
  {
    id: 'e6',
    date: '10.08',
    category: 'utilities',
    note: { uz: 'Internet va telefon', ru: 'Интернет и телефон', en: 'Internet and phone' },
    amount: som(890_000),
    paid: true,
  },
];

/** The month's expense budget, tiyin. Attainment is measured against it. */
export const EXPENSE_BUDGET = som(52_000_000);

export const expenseTotal = (): number =>
  EXPENSES.reduce((sum, expense) => sum + expense.amount, 0);

export const unpaidTotal = (): number =>
  EXPENSES.filter((expense) => !expense.paid).reduce((sum, expense) => sum + expense.amount, 0);

/**
 * Spend per category, biggest first.
 *
 * Derived from the list rather than written beside it: a breakdown that is
 * typed separately from the rows it breaks down is a breakdown that stops
 * matching the moment somebody adds an expense.
 */
/**
 * Category totals over any set of rows — the live ledger's or the fixture's.
 *
 * Here and not in books-server.ts, because the tabs (a client component)
 * draw it: the server seam imports `next/headers`, and a client file that
 * imports the seam for one pure function takes the whole build down with
 * it. Types and pure arithmetic live in *-data.ts; reads live in *-server.ts.
 */
export function categoryTotals(
  rows: readonly Expense[],
): readonly { category: ExpenseCategory; amount: number }[] {
  const totals = new Map<ExpenseCategory, number>();

  for (const row of rows) totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);

  return [...totals]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * The payables table.
 *
 * Settled invoices are dropped rather than drawn paid, and that is what the
 * fixture already does — not one of its five rows carries `paid`. The table is
 * a to-pay list with a Pay button on every row, so a settled invoice on it is a
 * button whose only possible answer is `purchase_order.already_paid`. Paying
 * one and watching the row leave is the confirmation; a row that still says
 * owing after the money went is the failure this whole wiring replaces.
 */

export function byCategory(): readonly { category: ExpenseCategory; amount: number }[] {
  const totals = new Map<ExpenseCategory, number>();

  for (const expense of EXPENSES) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }

  return [...totals]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/* -------------------------------------------------------------- payables */

export type Payable = {
  id: string;
  supplier: string;
  what: Trilingual;
  document: string;
  /** Days until due. Negative is overdue. */
  dueInDays: number;
  amount: number;
  paid?: boolean;
};

export const PAYABLES: readonly Payable[] = [
  {
    id: 'a1',
    supplier: "Farg'ona Meat",
    what: { uz: "Mol va qo'y go'shti", ru: 'Говядина и баранина', en: 'Beef and lamb' },
    document: 'INV-4821',
    dueInDays: -6,
    amount: som(18_400_000),
  },
  {
    id: 'a2',
    supplier: 'Chorsu Bozor',
    what: { uz: "Sabzavot va ko'katlar", ru: 'Овощи и зелень', en: 'Vegetables and herbs' },
    document: 'INV-4833',
    dueInDays: -2,
    amount: som(6_250_000),
  },
  {
    id: 'a3',
    supplier: 'Milko',
    what: { uz: 'Ichimlik va sut', ru: 'Напитки и молочка', en: 'Drinks and dairy' },
    document: 'INV-4840',
    dueInDays: 3,
    amount: som(9_800_000),
  },
  {
    id: 'a4',
    supplier: 'Bakery Plus',
    what: { uz: 'Non va lavash', ru: 'Хлеб и лаваш', en: 'Bread and lavash' },
    document: 'INV-4844',
    dueInDays: 5,
    amount: som(3_120_000),
  },
  {
    id: 'a5',
    supplier: 'Idish-tovoq Servis',
    what: { uz: 'Bir martalik idishlar', ru: 'Одноразовая посуда', en: 'Disposables' },
    document: 'INV-4851',
    dueInDays: 12,
    amount: som(2_450_000),
  },
];

export const payableTotal = (): number =>
  PAYABLES.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);

export const overdueTotal = (): number =>
  PAYABLES.filter((row) => !row.paid && row.dueInDays < 0).reduce(
    (sum, row) => sum + row.amount,
    0,
  );

export const dueSoonTotal = (): number =>
  PAYABLES.filter((row) => !row.paid && row.dueInDays >= 0 && row.dueInDays <= 7).reduce(
    (sum, row) => sum + row.amount,
    0,
  );

/* ----------------------------------------------------------- receivables */

/**
 * What guests owe us, which is the other half of the same tab.
 *
 * Credit sales are already revenue — the ticket was closed and the sale
 * counted on the day it happened. Settling one is a receipt, not a second
 * sale, and the screen says so, because booking it twice is the single easiest
 * way to overstate a month.
 */
export type Receivable = {
  id: string;
  customer: string;
  phone: string;
  /** Days since the debt was taken on. */
  ageDays: number;
  amount: number;
  /** Their agreed ceiling, or null where none is set. */
  limit: number | null;
};

export const RECEIVABLES: readonly Receivable[] = [
  {
    id: 'r1',
    customer: 'Anvar Qodirov',
    phone: '+998 90 331 20 14',
    ageDays: 68,
    amount: som(4_180_000),
    limit: som(5_000_000),
  },
  {
    id: 'r2',
    customer: 'Gulnora Ismoilova',
    phone: '+998 93 208 55 71',
    ageDays: 41,
    amount: som(2_640_000),
    limit: som(3_000_000),
  },
  {
    id: 'r3',
    customer: 'Sanoat Qurilish MChJ',
    phone: '+998 71 200 40 90',
    ageDays: 22,
    amount: som(9_200_000),
    limit: som(12_000_000),
  },
  {
    id: 'r4',
    customer: 'Shahzod Aliyev',
    phone: '+998 97 114 08 32',
    ageDays: 5,
    amount: som(860_000),
    limit: null,
  },
];

/** The four ageing buckets, in days. Anything past sixty is a write-off argument. */
export const AGEING = [
  { key: 'd0', from: 0, to: 7 },
  { key: 'd8', from: 8, to: 30 },
  { key: 'd31', from: 31, to: 60 },
  { key: 'd61', from: 61, to: Number.POSITIVE_INFINITY },
] as const;

export const ageingTotal = (from: number, to: number): number => bucketTotal(RECEIVABLES, from, to);

/**
 * One ageing bucket over any set of debtors — the live book's or the fixture's.
 *
 * `ageingTotal()` above closes over `RECEIVABLES`, which is the one thing it
 * cannot do once the rows come from `GET /crm/accounts`: the buckets would
 * describe the design's three debtors while the table under them showed the
 * restaurant's own. Same split, same reason, as `categoryTotals()` above.
 */
export const bucketTotal = (rows: readonly Receivable[], from: number, to: number): number =>
  rows
    .filter((row) => row.ageDays >= from && row.ageDays <= to)
    .reduce((sum, row) => sum + row.amount, 0);

/* --------------------------------------------------------------- payroll */

export type PayrollRow = {
  id: string;
  name: string;
  initials: string;
  role: 'manager' | 'waiter' | 'cashier' | 'kitchen' | 'warehouse';
  base: number;
  bonus: number;
  deductions: number;
};

export const PAYROLL: readonly PayrollRow[] = [
  {
    id: 'p1',
    name: 'Aziza Rasulova',
    initials: 'AR',
    role: 'manager',
    base: som(9_500_000),
    bonus: som(1_800_000),
    deductions: som(1_130_000),
  },
  {
    id: 'p2',
    name: 'Jasur Toshev',
    initials: 'JT',
    role: 'waiter',
    base: som(4_200_000),
    bonus: som(2_340_000),
    deductions: som(654_000),
  },
  {
    id: 'p3',
    name: 'Malika Rahimova',
    initials: 'MR',
    role: 'waiter',
    base: som(4_200_000),
    bonus: som(1_980_000),
    deductions: som(618_000),
  },
  {
    id: 'p4',
    name: 'Dilshod Karimov',
    initials: 'DK',
    role: 'cashier',
    base: som(4_800_000),
    bonus: som(600_000),
    deductions: som(540_000),
  },
  {
    id: 'p5',
    name: "Sardor Yo'ldoshev",
    initials: 'SY',
    role: 'kitchen',
    base: som(7_200_000),
    bonus: som(900_000),
    deductions: som(810_000),
  },
  {
    id: 'p6',
    name: 'Nilufar Ahmedova',
    initials: 'NA',
    role: 'warehouse',
    base: som(5_100_000),
    bonus: som(400_000),
    deductions: som(550_000),
  },
];

export const netPay = (row: PayrollRow): number => row.base + row.bonus - row.deductions;

/** The whole month, all sixty-nine of them — not the six the table shows. */
export const PAYROLL_FUND = som(128_400_000);
export const ADVANCE_PAID = som(51_400_000);
export const PAYROLL_STAFF = 69;
/** Payroll as a share of revenue. The number an owner actually watches. */
export const PAYROLL_SHARE = 26.1;

/* ---------------------------------------------------------- period close */

export type Period = {
  key: string;
  month: Trilingual;
  /** Revenue for the month, tiyin. */
  revenue: number;
  closed: boolean;
  /** The month still running. It cannot be closed, and the screen says why. */
  current?: boolean;
};

export const PERIODS: readonly Period[] = [
  {
    key: 'may',
    month: { uz: 'May 2026', ru: 'Май 2026', en: 'May 2026' },
    revenue: som(498_000_000),
    closed: true,
  },
  {
    key: 'jun',
    month: { uz: 'Iyun 2026', ru: 'Июнь 2026', en: 'June 2026' },
    revenue: som(521_000_000),
    closed: true,
  },
  {
    key: 'jul',
    month: { uz: 'Iyul 2026', ru: 'Июль 2026', en: 'July 2026' },
    revenue: som(543_000_000),
    closed: false,
  },
  {
    key: 'aug',
    month: { uz: 'Avgust 2026', ru: 'Август 2026', en: 'August 2026' },
    revenue: som(187_200_000),
    closed: false,
    current: true,
  },
];

export type ReconciliationRow = {
  key: 'cash' | 'card' | 'wallet' | 'bank';
  /** What the system says, tiyin. */
  system: number;
  /** What the drawer or the statement says. */
  actual: number;
};

export const RECONCILIATION: readonly ReconciliationRow[] = [
  { key: 'cash', system: som(4_820_000), actual: som(4_788_000) },
  { key: 'card', system: som(8_940_000), actual: som(8_940_000) },
  { key: 'wallet', system: som(3_510_000), actual: som(3_510_000) },
  { key: 'bank', system: som(17_270_000), actual: som(17_238_000) },
];

export const delta = (row: ReconciliationRow): number => row.actual - row.system;

/** Whether the month may be locked: every line agrees. */
export const reconciles = (): boolean => RECONCILIATION.every((row) => delta(row) === 0);

/* ------------------------------------------------------------- documents */

export type FilingState = 'pending' | 'ready' | 'sent' | 'signed';

export type Filing = {
  key: string;
  name: Trilingual;
  detail: Trilingual;
  state: FilingState;
  /** The one thing to do with it. */
  action: 'open' | 'send' | 'download';
};

export const FILINGS: readonly Filing[] = [
  {
    key: 'ehf',
    name: {
      uz: 'Elektron hisob-faktura (EHF)',
      ru: 'Электронный счёт-фактура (ЭСФ)',
      en: 'E-invoice (EHF)',
    },
    detail: {
      uz: 'Didox orqali 42 ta faktura yuborildi, 3 tasi qabul qilinishini kutmoqda',
      ru: 'Через Didox отправлено 42 счёта, 3 ожидают подтверждения',
      en: '42 invoices sent via Didox, 3 awaiting acceptance',
    },
    state: 'pending',
    action: 'open',
  },
  {
    key: 'vat',
    name: { uz: 'QQS hisoboti · iyul', ru: 'Отчёт по НДС · июль', en: 'VAT return · July' },
    detail: {
      uz: "Soliqqa tortiladigan savdo 543 mln, yig'ilgan QQS 65.2 mln. soliq.uz ga topshirishga tayyor",
      ru: 'Налогооблагаемая выручка 543 млн, НДС 65.2 млн. Готов к сдаче на soliq.uz',
      en: 'Taxable sales 543m, VAT collected 65.2m. Ready to file on soliq.uz',
    },
    state: 'ready',
    action: 'send',
  },
  {
    key: '1c',
    name: { uz: '1C ga eksport', ru: 'Выгрузка в 1С', en: '1C export' },
    detail: {
      uz: 'Iyul oyi provodkalari — savdo, xarajat, maosh va ombor harakati',
      ru: 'Проводки за июль — продажи, расходы, зарплата и склад',
      en: 'July postings — sales, expenses, payroll and stock',
    },
    state: 'sent',
    action: 'download',
  },
  {
    key: 'pnl',
    name: {
      uz: 'Foyda va zarar hisoboti',
      ru: 'Отчёт о прибылях и убытках',
      en: 'Profit and loss',
    },
    detail: {
      uz: 'Iyul: tushum 543 mln, xarajat 398 mln, sof foyda 145 mln',
      ru: 'Июль: выручка 543 млн, расходы 398 млн, чистая прибыль 145 млн',
      en: 'July: revenue 543m, costs 398m, net profit 145m',
    },
    state: 'signed',
    action: 'download',
  },
];

/* ---------------------------------------------------------- fixed assets */

/**
 * What the restaurant owns and how fast it is being written down.
 *
 * The design's sixth books tab, `bkAt6` (`Smart Restaurant OS.dc.html:16368`),
 * and the console did not have it. Without it the P&L is wrong in a way nobody
 * notices for a year: a 284 million so'm kitchen line bought in March is not a
 * March expense, and booking it as one makes March look catastrophic and every
 * month after it look better than it is.
 *
 * Straight-line, which is what `faRows` computes: the monthly charge is the
 * cost over the useful life, accumulated depreciation is that charge times the
 * months used, and book value is what is left. `mo` is carried rather than
 * derived because the design's own figures are rounded to the thousand so'm the
 * accountant posts, and re-deriving them here would put this table a few so'm
 * away from the ledger for no gain.
 */
export type FixedAsset = {
  name: Trilingual;
  where: Trilingual;
  /** `DD.MM.YYYY`, as an acquisition date is written on the document. */
  date: string;
  /** Tiyin. */
  cost: number;
  /** Useful life, in months. */
  life: number;
  /** Months already depreciated. */
  used: number;
  /** Tiyin per month. */
  monthly: number;
};

export const FIXED_ASSETS: readonly FixedAsset[] = [
  {
    name: {
      uz: 'Oshxona jihozi · Chilonzor',
      ru: 'Кухонное оборудование · Чиланзар',
      en: 'Kitchen line · Chilonzor',
    },
    where: { uz: 'Chilonzor', ru: 'Чиланзар', en: 'Chilonzor' },
    date: '12.03.2024',
    cost: som(284_000_000),
    life: 60,
    used: 29,
    monthly: som(4_733_000),
  },
  {
    name: {
      uz: "Bino ta'miri · Yunusobod",
      ru: 'Ремонт помещения · Юнусабад',
      en: 'Fit-out · Yunusobod',
    },
    where: { uz: 'Yunusobod', ru: 'Юнусабад', en: 'Yunusobod' },
    date: '01.09.2023',
    cost: som(620_000_000),
    life: 120,
    used: 35,
    monthly: som(5_167_000),
  },
  {
    name: { uz: 'Sovutish kamerasi', ru: 'Холодильная камера', en: 'Walk-in chiller' },
    where: { uz: 'Sergeli', ru: 'Сергели', en: 'Sergeli' },
    date: '22.06.2024',
    cost: som(96_000_000),
    life: 60,
    used: 26,
    monthly: som(1_600_000),
  },
  {
    name: {
      uz: 'POS terminallari, 12 dona',
      ru: 'POS-терминалы, 12 шт',
      en: 'POS terminals, 12 units',
    },
    where: { uz: 'Barcha filiallar', ru: 'Все филиалы', en: 'All branches' },
    date: '15.01.2025',
    cost: som(78_000_000),
    life: 36,
    used: 19,
    monthly: som(2_167_000),
  },
  {
    name: {
      uz: "Mebel · Mirzo Ulug'bek",
      ru: 'Мебель · Мирзо Улугбек',
      en: "Furniture · Mirzo Ulug'bek",
    },
    where: { uz: "Mirzo Ulug'bek", ru: 'Мирзо Улугбек', en: "Mirzo Ulug'bek" },
    date: '08.11.2024',
    cost: som(142_000_000),
    life: 60,
    used: 21,
    monthly: som(2_367_000),
  },
  {
    name: { uz: 'Yetkazish avtomobili', ru: 'Автомобиль доставки', en: 'Delivery vehicle' },
    where: { uz: 'Chilonzor', ru: 'Чиланзар', en: 'Chilonzor' },
    date: '30.04.2022',
    cost: som(168_000_000),
    life: 60,
    used: 51,
    monthly: som(2_800_000),
  },
  {
    name: {
      uz: 'Konditsioner tizimi · Termiz',
      ru: 'Система кондиционирования · Термез',
      en: 'HVAC · Termiz',
    },
    where: { uz: 'Termiz', ru: 'Термез', en: 'Termiz' },
    date: '17.02.2021',
    cost: som(88_000_000),
    life: 60,
    used: 66,
    monthly: som(1_467_000),
  },
];

/** Depreciation booked so far. Never more than the asset cost. */
export const accumulated = (asset: FixedAsset): number =>
  Math.min(asset.cost, asset.monthly * asset.used);

export const bookValue = (asset: FixedAsset): number => asset.cost - accumulated(asset);

/** An asset still charging this month. A fully written-down one charges nothing. */
export const stillCharging = (asset: FixedAsset): boolean => asset.used < asset.life;

/** The four rules the register is built on, as the design's `faNotes` states them. */
export const DEPRECIATION_NOTES: readonly Trilingual[] = [
  {
    uz: "Chiziqli usul: oylik summa = boshlang'ich qiymat ÷ foydali muddat. Qoldiq qiymat nolga qadar.",
    ru: 'Линейный метод: месячная сумма = стоимость ÷ срок службы. До нулевой остаточной стоимости.',
    en: 'Straight-line: monthly charge = cost ÷ useful life, down to zero book value.',
  },
  {
    uz: "Muddatlar: bino ta'miri 10 yil, oshxona jihozi 5 yil, mebel 5 yil, POS va IT 3 yil, transport 5 yil.",
    ru: 'Сроки: ремонт помещения 10 лет, кухонное оборудование 5 лет, мебель 5 лет, POS и ИТ 3 года, транспорт 5 лет.',
    en: 'Lives: fit-out 10 years, kitchen equipment 5, furniture 5, POS and IT 3, vehicles 5.',
  },
  {
    uz: 'Amortizatsiya P&L da alohida qator — u pul chiqimi emas, shuning uchun EBITDA dan pastda turadi.',
    ru: 'Амортизация — отдельная строка в P&L; это не денежный расход, поэтому ниже EBITDA.',
    en: 'Depreciation is its own P&L line; it is not a cash cost, so it sits below EBITDA.',
  },
  {
    uz: "60 mln so'mdan arzon xaridlar asosiy vosita emas — bir yo'la xarajatga yoziladi.",
    ru: 'Покупки дешевле 60 млн сум не считаются основным средством — списываются сразу.',
    en: 'Purchases under 60M so’m are not capitalised — they are expensed at once.',
  },
];

/* -------------------------------------------------------- money movement */

/**
 * Where the money physically is, and every hand it passed through.
 *
 * The design's seventh books tab, `bkAt7`. It is not a second expense list: a
 * cash drop from the till to the bank is twelve million so'm leaving one place
 * and arriving at another, and an expense report that counted it would show a
 * loss on a day that made money.
 */
export type MoneyMove = {
  /** `DD.MM HH:MM`, as the design writes it. */
  when: string;
  what: Trilingual;
  category: Trilingual;
  /** Which till, which bank, or the pair when it is a transfer. */
  account: Trilingual;
  who: string;
  /** Signed tiyin: positive in, negative out. */
  amount: number;
};

const SALES: Trilingual = { uz: 'Savdo tushumi', ru: 'Выручка', en: 'Sales' };
const TILL_1: Trilingual = { uz: 'Kassa 1', ru: 'Касса 1', en: 'Till 1' };
const BANK: Trilingual = { uz: 'Bank', ru: 'Банк', en: 'Bank' };
const TRANSFER: Trilingual = { uz: "Pul o'tqazmasi", ru: 'Перевод', en: 'Transfer' };
const DAILY_SALES: Trilingual = {
  uz: 'Kunlik savdo tushumi',
  ru: 'Дневная выручка',
  en: 'Daily sales',
};

export const MONEY_MOVES: readonly MoneyMove[] = [
  {
    when: '17.08 21:14',
    what: DAILY_SALES,
    category: SALES,
    account: TILL_1,
    who: 'Dilshod K.',
    amount: som(16_240_000),
  },
  {
    when: '17.08 18:40',
    what: {
      uz: "Farg'ona Meat — go'sht",
      ru: 'Фаргона Мит — мясо',
      en: "Farg'ona Meat — beef",
    },
    category: { uz: 'Xomashyo', ru: 'Сырьё', en: 'Raw materials' },
    account: TILL_1,
    who: 'Bekzod I.',
    amount: -som(2_840_000),
  },
  {
    when: '17.08 14:02',
    what: {
      uz: "Nilufar Y. — qarz to'lovi",
      ru: 'Нилуфар Ю. — погашение',
      en: 'Nilufar Y. — repayment',
    },
    category: { uz: "Qarz to'lovi", ru: 'Погашение долга', en: 'Debt repayment' },
    account: TILL_1,
    who: 'Dilshod K.',
    amount: som(480_000),
  },
  {
    when: '16.08 23:48',
    what: { uz: 'Inkassatsiya — bankka', ru: 'Инкассация в банк', en: 'Cash drop to bank' },
    category: TRANSFER,
    account: { uz: 'Kassa 1 → Bank', ru: 'Касса 1 → Банк', en: 'Till 1 → Bank' },
    who: 'Aziza R.',
    amount: -som(12_000_000),
  },
  {
    when: '16.08 12:30',
    what: { uz: 'Kommunal — avgust', ru: 'Коммунальные — август', en: 'Utilities — August' },
    category: { uz: 'Kommunal', ru: 'Коммунальные', en: 'Utilities' },
    account: BANK,
    who: 'Malika Y.',
    amount: -som(1_180_000),
  },
  {
    when: '16.08 10:15',
    what: {
      uz: 'Maosh avansi — 12 xodim',
      ru: 'Аванс — 12 сотрудников',
      en: 'Payroll advance — 12 staff',
    },
    category: { uz: 'Maosh', ru: 'Зарплата', en: 'Payroll' },
    account: BANK,
    who: 'Malika Y.',
    amount: -som(4_800_000),
  },
  {
    when: '15.08 23:52',
    what: DAILY_SALES,
    category: SALES,
    account: TILL_1,
    who: 'Dilshod K.',
    amount: som(18_420_000),
  },
  {
    when: '15.08 16:20',
    what: {
      uz: "Sergeli filialiga ko'chirish",
      ru: 'Перевод в филиал Сергели',
      en: 'Transfer to Sergeli',
    },
    category: TRANSFER,
    account: { uz: 'Bank → Sergeli', ru: 'Банк → Сергели', en: 'Bank → Sergeli' },
    who: 'Rustam K.',
    amount: -som(3_000_000),
  },
];

/** Till plus bank, right now. */
export const BALANCE_NOW = som(6_840_000);

/**
 * The balance as it stood after each row, newest first.
 *
 * Walked backwards from what is in the drawer and the bank today, because that
 * is the only figure anybody can verify: a stored historical balance is a
 * number that drifts the first time a row is edited.
 */
export function movementBalances(): readonly number[] {
  let running = BALANCE_NOW;

  return MONEY_MOVES.map((move) => {
    running -= move.amount;

    return running + move.amount;
  });
}

export const moneyIn = (): number =>
  MONEY_MOVES.filter((move) => move.amount > 0).reduce((sum, move) => sum + move.amount, 0);

export const moneyOut = (): number =>
  MONEY_MOVES.filter((move) => move.amount < 0).reduce((sum, move) => sum - move.amount, 0);

export const LEDGER_COPY = {
  tabAssets: { uz: 'Asosiy vositalar', ru: 'Основные средства', en: 'Fixed assets' },
  tabMoves: { uz: "Pul o'tqazmalari", ru: 'Движение денег', en: 'Money movement' },

  faRegister: {
    uz: 'Asosiy vositalar reyestri',
    ru: 'Реестр основных средств',
    en: 'Fixed asset register',
  },
  faRegisterSub: {
    uz: 'Chiziqli amortizatsiya. Oylik summa xarajatga yoziladi va foydani kamaytiradi.',
    ru: 'Линейная амортизация. Месячная сумма относится на расходы и уменьшает прибыль.',
    en: 'Straight-line depreciation. The monthly charge is expensed and reduces profit.',
  },
  faAdd: { uz: "Vosita qo'shish", ru: 'Добавить средство', en: 'Add asset' },
  faAddForm: {
    uz: "Vosita qo'shish formasi",
    ru: 'Форма добавления средства',
    en: 'Add asset form',
  },
  faName: { uz: 'Nomi', ru: 'Наименование', en: 'Asset' },
  faBought: { uz: 'Sotib olingan', ru: 'Приобретено', en: 'Acquired' },
  faCost: { uz: "Boshlang'ich qiymat", ru: 'Первоначальная стоимость', en: 'Cost' },
  faLife: { uz: 'Muddat', ru: 'Срок', en: 'Life' },
  faMonthly: { uz: 'Oylik', ru: 'В месяц', en: 'Monthly' },
  faAccum: { uz: "Yig'ilgan", ru: 'Накоплено', en: 'Accumulated' },
  faBook: { uz: 'Qoldiq qiymat', ru: 'Остаточная стоимость', en: 'Book value' },
  faTotal: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  faSoon: {
    uz: 'Muddati tugayotganlar',
    ru: 'Скоро самортизируются',
    en: 'Nearing end of life',
  },
  faSoonSub: {
    uz: 'Qoldiq qiymat nolga yaqin — almashtirish byudjetiga kiritish kerak',
    ru: 'Остаточная стоимость близка к нулю — заложить в бюджет замены',
    en: 'Book value is close to zero — budget for replacement',
  },
  faDone: { uz: 'Tugagan', ru: 'Самортизировано', en: 'Fully depreciated' },
  faDoneWhy: {
    uz: 'Qoldiq qiymat 0. Ishlatilmoqda, lekin balansda turmaydi.',
    ru: 'Остаточная стоимость 0. В эксплуатации, но не на балансе.',
    en: 'Book value 0. Still in use but off the books.',
  },
  faMonthsLeft: { uz: 'oy qoldi', ru: 'мес. осталось', en: 'months left' },
  faMethod: { uz: 'Metodika', ru: 'Методика', en: 'Method' },
  faKpiCost: {
    uz: "Boshlang'ich qiymat",
    ru: 'Первоначальная стоимость',
    en: 'Total cost',
  },
  faKpiAssets: { uz: 'ta vosita', ru: 'объектов', en: 'assets' },
  faKpiBook: { uz: 'Qoldiq qiymat', ru: 'Остаточная стоимость', en: 'Book value' },
  faKpiRemaining: { uz: 'qoldi', ru: 'осталось', en: 'remaining' },
  faKpiMonthly: {
    uz: 'Oylik amortizatsiya',
    ru: 'Амортизация в месяц',
    en: 'Monthly depreciation',
  },
  faKpiExpensed: {
    uz: 'xarajatga yoziladi',
    ru: 'относится на расходы',
    en: 'expensed each month',
  },
  faKpiDone: {
    uz: 'To‘liq amortizatsiya qilingan',
    ru: 'Полностью самортизировано',
    en: 'Fully depreciated',
  },
  faKpiAwaiting: {
    uz: 'almashtirish kutilmoqda',
    ru: 'ожидают замены',
    en: 'awaiting replacement',
  },
  years: { uz: 'yil', ru: 'лет', en: 'yr' },

  mvAdd: { uz: "Yozuv qo'shish", ru: 'Добавить запись', en: 'Add entry' },
  mvAddHint: {
    uz: 'Yangi yozuv — toifa, hisob, summa, izoh',
    ru: 'Новая запись — категория, счёт, сумма, комментарий',
    en: 'New entry — category, account, amount, note',
  },
  mvWhen: { uz: 'Sana va vaqt', ru: 'Дата и время', en: 'When' },
  mvWhat: { uz: 'Izoh', ru: 'Описание', en: 'Description' },
  mvAccount: { uz: 'Hisob', ru: 'Счёт', en: 'Account' },
  mvWho: { uz: 'Kim', ru: 'Кто', en: 'Who' },
  mvAmount: { uz: 'Summa', ru: 'Сумма', en: 'Amount' },
  mvBalance: { uz: 'Qoldiq', ru: 'Остаток', en: 'Balance' },
  mvNote: {
    uz: "Kassa va bank orasidagi ko'chirish sotuv emas — u tushumga kirmaydi, faqat pulning joyini o'zgartiradi. Filiallar orasidagi ko'chirish ikkala filial hisobida ko'rinadi.",
    ru: 'Перевод между кассой и банком — не продажа: он не попадает в выручку, а лишь меняет местонахождение денег. Перевод между филиалами виден в обоих филиалах.',
    en: 'A transfer between till and bank is not a sale — it does not enter revenue, it only moves money. A branch-to-branch transfer shows in both branches.',
  },
  mvAll: { uz: 'Hammasi', ru: 'Все', en: 'All' },
  mvIn: { uz: 'Kirim', ru: 'Приход', en: 'In' },
  mvOut: { uz: 'Chiqim', ru: 'Расход', en: 'Out' },
  mvKpiIn: { uz: 'Kirim', ru: 'Поступления', en: 'Money in' },
  mvKpiInNote: { uz: '3 kun ichida', ru: 'за 3 дня', en: 'over 3 days' },
  mvKpiOut: { uz: 'Chiqim', ru: 'Расходы', en: 'Money out' },
  mvKpiOutNote: { uz: '5 ta yozuv', ru: '5 записей', en: '5 entries' },
  mvKpiNet: { uz: 'Sof oqim', ru: 'Чистый поток', en: 'Net flow' },
  mvKpiNetNote: { uz: 'kirim minus chiqim', ru: 'приход минус расход', en: 'in minus out' },
  mvKpiBalance: { uz: 'Joriy qoldiq', ru: 'Текущий остаток', en: 'Balance now' },
  mvKpiBalanceNote: { uz: 'kassa va bank', ru: 'касса и банк', en: 'till and bank' },
} as const satisfies Record<string, Trilingual>;

/**
 * The tab keys, here and not in books-tabs.tsx: that file is `'use client'`,
 * and a constant exported from a client module reaches a server page as a
 * client *reference*, not a value — `BOOKS_TABS.filter is not a function`
 * was the whole books screen answering 500.
 */
export type BooksTab = 'exp' | 'debts' | 'payroll' | 'close' | 'assets' | 'moves' | 'docs';
export const BOOKS_TABS: readonly BooksTab[] = [
  'exp',
  'debts',
  'payroll',
  'close',
  'assets',
  'moves',
  'docs',
];
