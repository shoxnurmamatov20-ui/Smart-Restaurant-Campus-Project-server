import type { Messages } from '@/i18n';

/**
 * Who the restaurant buys from, as the design's screen lists it.
 *
 * Wired to `GET /api/v1/suppliers/suppliers` — see `./suppliers-server.ts`. The
 * list below is what the screen draws with no session behind it.
 *
 * The on-time figure is computed by the API from the orders that were actually
 * received, never stored: a column written once is right on the day it was
 * written and wrong every morning after, with nothing on the screen to say
 * which.
 */

type Suppliers = Messages['console']['suppliers'];

export type SupplierRow = {
  id: string;
  /** A company name is a proper noun; it is not translated. */
  name: string;
  category: keyof Pick<
    Suppliers,
    'catMeat' | 'catDry' | 'catDairy' | 'catProduce' | 'catBeverages' | 'catPoultry'
  >;
  lead: keyof Pick<Suppliers, 'leadNextDay' | 'leadTwoDays' | 'leadThreeDays' | 'leadSameDay'>;
  /**
   * Deliveries that arrived when they said they would, as a percentage.
   *
   * `null` for a supplier nothing has arrived from yet. Zero would read as
   * "never on time", which is the opposite of what an empty history means —
   * and this is the column a buyer sorts by.
   */
  onTime: number | null;
  openPurchases: number;
  contact: string;
  /** This quarter, in tiyin. */
  spend: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const SUPPLIERS: readonly SupplierRow[] = [
  {
    id: 'fargona-meat',
    name: "Farg'ona Meat",
    category: 'catMeat',
    lead: 'leadNextDay',
    onTime: 96,
    openPurchases: 2,
    contact: '+998 90 123 45 67',
    spend: som(42_800_000),
  },
  {
    id: 'osiyo-savdo',
    name: 'Osiyo Savdo',
    category: 'catDry',
    lead: 'leadTwoDays',
    onTime: 91,
    openPurchases: 1,
    contact: '+998 91 220 11 08',
    spend: som(28_100_000),
  },
  {
    id: 'milko',
    name: 'Milko',
    category: 'catDairy',
    lead: 'leadNextDay',
    onTime: 88,
    openPurchases: 3,
    contact: '+998 93 507 62 30',
    spend: som(16_400_000),
  },
  {
    id: 'chorsu',
    name: 'Chorsu Bozor',
    category: 'catProduce',
    lead: 'leadSameDay',
    onTime: 99,
    openPurchases: 0,
    contact: '+998 90 774 19 52',
    spend: som(12_700_000),
  },
  {
    id: 'coca-cola',
    name: 'Coca-Cola UZ',
    category: 'catBeverages',
    lead: 'leadThreeDays',
    onTime: 94,
    openPurchases: 1,
    contact: '+998 78 140 00 00',
    spend: som(9_300_000),
  },
  {
    id: 'parranda',
    name: 'Parranda Plus',
    category: 'catPoultry',
    lead: 'leadTwoDays',
    onTime: 82,
    openPurchases: 1,
    contact: '+998 97 331 84 26',
    spend: som(7_600_000),
  },
];

/**
 * How the on-time figure is coloured.
 *
 * The design's thresholds: 92 and up is fine, 85 and up is worth watching,
 * below that is a supplier the kitchen has to plan around.
 */
export function onTimeTone(percent: number | null): 'success' | 'warning' | 'danger' | 'muted' {
  // Nothing has arrived yet, so there is nothing to colour. A green 100% for a
  // supplier who has never delivered is the one cell on this screen a buyer
  // could not check.
  if (percent === null) return 'muted';
  if (percent >= 92) return 'success';
  if (percent >= 85) return 'warning';

  return 'danger';
}

/**
 * A purchase order, as the screen's second table lists it.
 *
 * Wired to `GET /api/v1/suppliers/purchase-orders` — see `./suppliers-server.ts`.
 * The list below is what the screen draws with no session behind it.
 */
export type PurchaseStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';

export type PurchaseOrderRow = {
  id: string;
  /** The document number a buyer quotes on the phone. */
  number: string;
  /** A company name is a proper noun; it is not translated. */
  supplier: string;
  /** `YYYY-MM-DD`, or `null` when nobody has committed to a date yet. */
  expected: string | null;
  lines: number;
  status: PurchaseStatus;
  /** In tiyin. */
  total: number;
};

/** Which of the five states leave an order still to be dealt with. */
export const OPEN_PURCHASE_STATUSES: readonly PurchaseStatus[] = ['draft', 'sent', 'confirmed'];

export const isOpenPurchase = (row: PurchaseOrderRow): boolean =>
  OPEN_PURCHASE_STATUSES.includes(row.status);

/**
 * The demo book.
 *
 * A function rather than a constant because the dates are relative: a fixture
 * with 20 August written into it is a fixture that reads as three months
 * overdue by November, and the one thing this table is for is showing which
 * deliveries are late.
 */
export function purchaseOrderFixture(): readonly PurchaseOrderRow[] {
  return [
    {
      id: 'po-6',
      number: 'PO-0006',
      supplier: 'Chorsu Bozor',
      expected: day(0),
      lines: 3,
      status: 'sent',
      total: som(511_500),
    },
    {
      id: 'po-5',
      number: 'PO-0005',
      supplier: "Farg'ona Meat",
      expected: day(1),
      lines: 3,
      status: 'confirmed',
      total: som(5_830_000),
    },
    {
      id: 'po-7',
      number: 'PO-0007',
      supplier: 'Osiyo Savdo',
      expected: day(3),
      lines: 2,
      status: 'draft',
      total: som(2_415_000),
    },
    {
      // Overdue and still open — the row the colour on the date column exists
      // for, and the one a buyer has to chase this morning.
      id: 'po-9',
      number: 'PO-0009',
      supplier: 'Milko',
      expected: day(-2),
      lines: 2,
      status: 'confirmed',
      total: som(840_000),
    },
    {
      id: 'po-4',
      number: 'PO-0004',
      supplier: 'Coca-Cola UZ',
      expected: day(-1),
      lines: 2,
      status: 'received',
      total: som(450_000),
    },
    {
      id: 'po-8',
      number: 'PO-0008',
      supplier: 'Parranda Plus',
      expected: day(-5),
      lines: 2,
      status: 'cancelled',
      total: som(450_000),
    },
  ];
}

/** `YYYY-MM-DD`, so many days from today. */
function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);

  return [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0'),
  ].join('-');
}

/* ============================================================
   Payables — the third tab, `specs/01-os.md §5.9`

   Suppliers answers "who do we buy from" and purchase orders answers "what did
   we ask for". Neither answers the one a manager is phoned about: **what do we
   owe, and what is late.** That is this tab.

   The same rows live on `finance/books` under Debts, and deliberately: an
   accountant reaches it through the ledger and a manager reaches it through
   the supplier who just called. One dataset, two doors — `books-data.ts`
   carries the accountant's view of it.
   ============================================================ */

export type PayableRow = {
  id: string;
  supplierId: string;
  document: string;
  /** Days until due. Negative is overdue. */
  dueInDays: number;
  /** Tiyin. */
  amount: number;
};

export const PAYABLES: readonly PayableRow[] = [
  {
    id: 'p1',
    supplierId: 'fargona-meat',
    document: 'INV-4821',
    dueInDays: -6,
    amount: som(18_400_000),
  },
  { id: 'p2', supplierId: 'chorsu', document: 'INV-4833', dueInDays: -2, amount: som(6_250_000) },
  { id: 'p3', supplierId: 'milko', document: 'INV-4840', dueInDays: 3, amount: som(9_800_000) },
  {
    id: 'p4',
    supplierId: 'osiyo-savdo',
    document: 'INV-4844',
    dueInDays: 5,
    amount: som(3_120_000),
  },
  {
    id: 'p5',
    supplierId: 'coca-cola',
    document: 'INV-4851',
    dueInDays: 12,
    amount: som(2_450_000),
  },
];

export const overdueCount = (): number => PAYABLES.filter((row) => row.dueInDays < 0).length;

export const payableTotal = (): number => PAYABLES.reduce((sum, row) => sum + row.amount, 0);

export const overdueTotal = (): number =>
  PAYABLES.filter((row) => row.dueInDays < 0).reduce((sum, row) => sum + row.amount, 0);

/* -------------------------------------------------------------- new order */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/**
 * The third supplier tab, which this screen did not have.
 *
 * The design's strip is `poTabSup · poTabOrders · poTabNew` — suppliers, the
 * order book, and the order you are about to raise. The console put payables
 * there instead; in the design payables are a *books* tab (`bkT2`), and that
 * placement is right: an unpaid invoice is an accounting problem and a short
 * shelf is a purchasing one, and the person who fixes each is not the same
 * person.
 *
 * Everything below is `PO_SUPS` and `PO_CATALOG` at
 * `Smart Restaurant OS.dc.html:12998-13029`, with prices carried into tiyin.
 */
export type OrderSupplier = {
  id: string;
  name: string;
  /** Phone, and how the order actually reaches them. */
  contact: string;
  /** Days from sending to delivery. */
  lead: number;
  terms: Trilingual;
};

export const ORDER_SUPPLIERS: readonly OrderSupplier[] = [
  {
    id: 'gosht',
    name: "Farg'ona Meat",
    contact: '+998 90 123 45 67 · Telegram',
    lead: 1,
    terms: { uz: '14 kun kechiktirilgan', ru: 'Отсрочка 14 дней', en: 'Net 14' },
  },
  {
    id: 'sabzavot',
    name: 'Chorsu Bozor',
    contact: '+998 91 234 56 78 · Telegram',
    lead: 1,
    terms: { uz: 'Yetkazishda naqd', ru: 'Наличными при поставке', en: 'Cash on delivery' },
  },
  {
    id: 'sut',
    name: 'Milko',
    contact: '+998 93 345 67 89',
    lead: 1,
    terms: { uz: '7 kun kechiktirilgan', ru: 'Отсрочка 7 дней', en: 'Net 7' },
  },
  {
    id: 'ichimlik',
    name: 'Coca-Cola UZ',
    contact: '+998 95 456 78 90',
    lead: 3,
    terms: { uz: '30 kun kechiktirilgan', ru: 'Отсрочка 30 дней', en: 'Net 30' },
  },
];

/**
 * A line the system suggests ordering.
 *
 * `have`, `need` and `daily` are what make the suggestion honest: the default
 * quantity is the gap rounded up to a whole pack, and the row says how many
 * days of cover that leaves. A suggested quantity with no arithmetic shown is a
 * number a manager either trusts blindly or overrides blindly.
 */
export type OrderLine = {
  id: string;
  name: Trilingual;
  /** Tiyin, per unit. */
  price: number;
  unit: Trilingual;
  have: number;
  need: number;
  /** Average daily consumption. */
  daily: number;
  /** The supplier will not split this. */
  pack: number;
};

const KG: Trilingual = { uz: 'kg', ru: 'кг', en: 'kg' };
const EACH: Trilingual = { uz: 'dona', ru: 'шт', en: 'ea' };

export const ORDER_CATALOGUE: Readonly<Record<string, readonly OrderLine[]>> = {
  gosht: [
    {
      id: 'g1',
      name: { uz: "Mol go'shti, bo'yin", ru: 'Говядина, шея', en: 'Beef, chuck' },
      price: som(78_000),
      unit: KG,
      have: 12,
      need: 40,
      daily: 9.4,
      pack: 5,
    },
    {
      id: 'g2',
      name: { uz: "Qo'y go'shti", ru: 'Баранина', en: 'Lamb' },
      price: som(96_000),
      unit: KG,
      have: 21,
      need: 25,
      daily: 5.2,
      pack: 5,
    },
    {
      id: 'g3',
      name: { uz: 'Tovuq filesi', ru: 'Куриное филе', en: 'Chicken breast' },
      price: som(42_000),
      unit: KG,
      have: 38,
      need: 45,
      daily: 11.8,
      pack: 5,
    },
    {
      id: 'g4',
      name: { uz: 'Qiyma, aralash', ru: 'Фарш, смешанный', en: 'Mince, mixed' },
      price: som(64_000),
      unit: KG,
      have: 24,
      need: 30,
      daily: 7.1,
      pack: 5,
    },
  ],
  sabzavot: [
    {
      id: 's1',
      name: { uz: 'Kartoshka', ru: 'Картофель', en: 'Potato' },
      price: som(6_500),
      unit: KG,
      have: 88,
      need: 120,
      daily: 28,
      pack: 10,
    },
    {
      id: 's2',
      name: { uz: 'Piyoz', ru: 'Лук', en: 'Onion' },
      price: som(5_200),
      unit: KG,
      have: 64,
      need: 80,
      daily: 18,
      pack: 10,
    },
    {
      id: 's3',
      name: { uz: 'Sabzi', ru: 'Морковь', en: 'Carrot' },
      price: som(5_800),
      unit: KG,
      have: 47,
      need: 60,
      daily: 14,
      pack: 10,
    },
    {
      id: 's4',
      name: { uz: 'Pomidor', ru: 'Помидоры', en: 'Tomato' },
      price: som(12_000),
      unit: KG,
      have: 8,
      need: 45,
      daily: 12,
      pack: 5,
    },
  ],
  sut: [
    {
      id: 'd1',
      name: { uz: 'Smetana 20%', ru: 'Сметана 20%', en: 'Sour cream 20%' },
      price: som(28_000),
      unit: KG,
      have: 15,
      need: 18,
      daily: 4.2,
      pack: 2,
    },
    {
      id: 'd2',
      name: { uz: "Sariyog'", ru: 'Сливочное масло', en: 'Butter' },
      price: som(84_000),
      unit: KG,
      have: 3,
      need: 12,
      daily: 2.8,
      pack: 2,
    },
    {
      id: 'd3',
      name: { uz: 'Suzma', ru: 'Сузьма', en: 'Suzma' },
      price: som(32_000),
      unit: KG,
      have: 12,
      need: 15,
      daily: 3.4,
      pack: 2,
    },
  ],
  ichimlik: [
    {
      id: 'i1',
      name: { uz: 'Gazli suv 0.5 l', ru: 'Газвода 0.5 л', en: 'Sparkling water 0.5 l' },
      price: som(4_200),
      unit: EACH,
      have: 284,
      need: 400,
      daily: 88,
      pack: 24,
    },
    {
      id: 'i2',
      name: { uz: "Choy, ko'k", ru: 'Чай зелёный', en: 'Green tea' },
      price: som(62_000),
      unit: KG,
      have: 2,
      need: 8,
      daily: 1.1,
      pack: 1,
    },
    {
      id: 'i3',
      name: { uz: 'Kola 1 l', ru: 'Кола 1 л', en: 'Cola 1 l' },
      price: som(9_800),
      unit: EACH,
      have: 122,
      need: 180,
      daily: 38,
      pack: 12,
    },
  ],
};

/** What the system proposes: the gap, rounded up to whole packs. */
export const suggestedQuantity = (line: OrderLine): number =>
  Math.ceil(Math.max(0, line.need - line.have) / line.pack) * line.pack;

/**
 * The weekly purchasing budget, in tiyin.
 *
 * 8 000 000 so'm — `PO_BUDGET`, `Smart Restaurant OS.dc.html:13039`. Above it
 * the order still sends; what changes is that it needs a manager, which is the
 * difference between a control and a wall.
 */
export const PURCHASE_BUDGET = som(8_000_000);

/** VAT, as the order card states it: 12%, already inside the total. */
export const VAT_RATE = 0.12;

export const ORDER_COPY = {
  tabNew: { uz: 'Yangi buyurtma', ru: 'Новый заказ', en: 'New order' },
  newBtn: { uz: 'Buyurtma yaratish', ru: 'Создать заказ', en: 'Create order' },
  pickSupplier: {
    uz: 'Yetkazib beruvchini tanlang',
    ru: 'Выберите поставщика',
    en: 'Choose a supplier',
  },
  suggested: {
    uz: 'Tavsiya etilgan pozitsiyalar',
    ru: 'Рекомендуемые позиции',
    en: 'Suggested items',
  },
  suggestedNote: {
    uz: "Zaxira darajasi va o'rtacha sarfdan hisoblandi",
    ru: 'Рассчитано по остаткам и среднему расходу',
    en: 'Calculated from stock levels and average consumption',
  },
  positions: { uz: 'Pozitsiya', ru: 'Позиций', en: 'Items' },
  lead: { uz: 'Yetkazish muddati', ru: 'Срок поставки', en: 'Lead time' },
  eta: { uz: 'Kutilyapti', ru: 'Ожидается', en: 'Expected' },
  terms: { uz: "To'lov sharti", ru: 'Условия оплаты', en: 'Payment terms' },
  total: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  vat: { uz: 'shundan QQS 12%:', ru: 'в том числе НДС 12%:', en: 'of which VAT 12%:' },
  send: { uz: 'Buyurtmani yuborish', ru: 'Отправить заказ', en: 'Send order' },
  draft: { uz: 'Qoralama sifatida saqlash', ru: 'Сохранить черновик', en: 'Save as draft' },
  draftSaved: { uz: 'Qoralama saqlandi', ru: 'Черновик сохранён', en: 'Draft saved' },
  note: {
    uz: "Buyurtma Telegram va elektron pochta orqali yuboriladi. Yetkazib beruvchi tasdiqlagach, kutilayotgan qoldiq omborga qo'shiladi.",
    ru: 'Заказ уходит в Telegram и на почту. После подтверждения поставщиком ожидаемый остаток добавляется на склад.',
    en: 'The order goes out by Telegram and email. Once the supplier confirms, the expected quantity is added to stock.',
  },
  nothingPicked: {
    uz: 'Hech qanday pozitsiya tanlanmadi',
    ru: 'Ни одна позиция не выбрана',
    en: 'No items selected',
  },
  sent: { uz: 'yuborildi', ru: 'отправлен', en: 'sent' },
  inStock: { uz: 'Qoldiq', ru: 'Остаток', en: 'In stock' },
  afterDelivery: { uz: 'buyurtmadan keyin', ru: 'после поставки', en: 'after delivery' },
  days: { uz: 'kun', ru: 'дн.', en: 'days' },
  tomorrow: { uz: 'Ertaga', ru: 'Завтра', en: 'Tomorrow' },
  august: { uz: 'avgust', ru: 'августа', en: 'August' },
  overBudgetBefore: {
    uz: 'Haftalik xarid byudjetidan ',
    ru: 'Превышение недельного бюджета закупок на ',
    en: 'Over the weekly purchasing budget by ',
  },
  overBudgetAfter: {
    uz: " so'm oshib ketdi. Menejer tasdig'i kerak.",
    ru: ' сум. Требуется подтверждение менеджера.',
    en: " so'm. Manager approval required.",
  },

  /* ---- the pad, once it raises a real document — see ./order-pad.ts ---- */

  termsCash: {
    uz: 'Yetkazishda naqd',
    ru: 'Наличными при поставке',
    en: 'Cash on delivery',
  },
  termsNet: {
    uz: '{n} kun kechiktirilgan',
    ru: 'Отсрочка {n} дней',
    en: 'Net {n}',
  },
  /** The row's second line when no usage history says how long the shelf lasts. */
  parLevel: { uz: 'minimal', ru: 'минимум', en: 'par' },
  noSuppliers: {
    uz: "Yetkazib beruvchi yo'q — avval birini qo'shing.",
    ru: 'Поставщиков нет — сначала добавьте одного.',
    en: 'No suppliers yet — add one first.',
  },
  noLines: {
    uz: "Omborda pozitsiya yo'q — avval xomashyo qo'shing.",
    ru: 'На складе нет позиций — сначала добавьте сырьё.',
    en: 'Nothing on the shelf yet — add ingredients first.',
  },
  sending: { uz: 'Yuborilmoqda…', ru: 'Отправка…', en: 'Sending…' },
  sendFailed: {
    uz: "Buyurtmani yuborib bo'lmadi.",
    ru: 'Не удалось отправить заказ.',
    en: 'The order could not be sent.',
  },
  demoOnly: {
    uz: 'Namunaviy narxnoma — bu yerdan haqiqiy buyurtma ketmaydi.',
    ru: 'Демонстрационный прайс — реальный заказ отсюда не уходит.',
    en: 'A sample price list — no real order leaves from here.',
  },
} as const satisfies Record<string, Trilingual>;
