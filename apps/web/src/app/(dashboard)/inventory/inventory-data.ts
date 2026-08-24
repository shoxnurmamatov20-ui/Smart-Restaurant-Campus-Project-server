import type { Messages } from '@/i18n';

/**
 * The store room, as the design's screen lists it.
 *
 * Quantities are decimal because ingredients are weighed, not counted — 4.2 kg
 * of beef is a real reading. Money stays integer tiyin.
 *
 * Wired to `GET /api/v1/inventory/ingredients` — see `./inventory-server.ts`.
 * The list below is what the screen draws with no session behind it.
 */

/* --------------------------------------------------------------- language */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/* ------------------------------------------------------------------ units */

/** The three units the console's own catalogue names. */
export type CatalogueUnit = keyof Pick<
  Messages['console']['inventory'],
  'unitKg' | 'unitL' | 'unitPcs'
>;

/**
 * What a line is bought and counted in.
 *
 * `unitCase` is a fourth and deliberately outside the catalogue: the design
 * buys Coca-Cola by the case and spends it by the piece
 * (`u: P("quti", "ящик", "case")`, `Smart Restaurant OS.dc.html:13423`), and
 * the catalogue this console reads has no word for a case. That is why the
 * screen resolves units through `unitLabel()` instead of a bare `t(row.unit)`.
 */
export type Unit = CatalogueUnit | 'unitCase';

/**
 * What a recipe card is written in.
 *
 * Always the smaller of the pair — grams under kilograms, millilitres under
 * litres, pieces under cases — because a recipe spends 180 g of rice and there
 * is no sane way to write that as a fraction of a sack.
 */
export type BaseUnit = 'g' | 'ml' | 'pcs';

/**
 * The stores inside one branch (`stores()`, `Smart Restaurant OS.dc.html:11644`).
 *
 * Every line sits in exactly one of them and is depleted from that one, which
 * is why the shelf table names the store rather than leaving it to be guessed
 * from what the ingredient is.
 */
export type StoreId = 'main' | 'kitchen' | 'bar';

export const STORE_NAMES: Readonly<Record<StoreId, Trilingual>> = {
  main: { uz: 'Asosiy ombor', ru: 'Основной склад', en: 'Main store' },
  kitchen: { uz: 'Oshxona ombori', ru: 'Склад кухни', en: 'Kitchen store' },
  bar: { uz: 'Bar ombori', ru: 'Склад бара', en: 'Bar store' },
};

/**
 * Who answers for each store, and what it holds.
 *
 * `stores()` carries a `who` and a `note` alongside the name, and the screen
 * prints both under the chips: *"Ichimlik va spirtli mahsulot · mas'ul: Nilufar
 * Yusupova"*. That line is the reason the chips are worth having — a shortfall
 * in the bar is a different conversation with a different person than a
 * shortfall in the kitchen, and the screen says which before anyone asks.
 */
export const STORE_KEEPER: Readonly<Record<StoreId, string>> = {
  main: 'Bekzod Ismoilov',
  kitchen: 'Malika Rahimova',
  bar: 'Nilufar Yusupova',
};

export const STORE_NOTE: Readonly<Record<StoreId, Trilingual>> = {
  main: { uz: 'Xomashyo va quruq mahsulot', ru: 'Сырьё и сухие продукты', en: 'Raw and dry goods' },
  kitchen: {
    uz: 'Kunlik zapas va yarim tayyor',
    ru: 'Дневной запас и полуфабрикаты',
    en: 'Daily stock and prep items',
  },
  bar: { uz: 'Ichimlik va spirtli mahsulot', ru: 'Напитки и алкоголь', en: 'Drinks and alcohol' },
};

/** The order the chips are drawn in, after "all stores". */
export const STORE_IDS: readonly StoreId[] = ['main', 'kitchen', 'bar'];

/** Whether `?store=` named one of them. */
export const isStoreId = (value: unknown): value is StoreId =>
  typeof value === 'string' && (STORE_IDS as readonly string[]).includes(value);

/**
 * The low-stock count a chip carries.
 *
 * `INV.filter(r => on / r.par < 0.5)` in the design — under half of par, which
 * is the same threshold `levelOf()` calls `belowPar`. Counted per store rather
 * than overall, because that is the number that decides which chip a
 * storekeeper presses first.
 */
export const lowIn = (rows: readonly StockRow[], store: StoreId | null): number =>
  rows.filter((row) => (store === null || row.store === store) && row.onHand / row.par < 0.5)
    .length;

/** The design tints the store name so the three read apart at a glance. */
export const STORE_TONE: Readonly<Record<StoreId, string>> = {
  main: 'var(--fg-subtle)',
  kitchen: 'var(--warning-600)',
  bar: 'var(--accent-600)',
};

export type StockRow = {
  id: string;
  /** An ingredient's name as the storekeeper knows it. */
  name: string;
  /** What it is bought and counted in. */
  unit: Unit;
  /**
   * What the recipe card spends it in, or `null` when the two are the same.
   *
   * `null` is not a missing value: an ingredient the API already holds in
   * kilograms has no second unit to convert to, and printing "1 kg = 1 kg"
   * would be a conversion nobody needs to know.
   */
  baseUnit: BaseUnit | null;
  /** Base units in one purchase unit: 1 kg = 1000 g, 1 case = 24 pcs. */
  factor: number;
  /** Tiyin per one purchase unit. */
  price: number;
  /** How many days a delivery keeps, or `null` where the API has no column. */
  shelfLife: number | null;
  onHand: number;
  /** The level below which the kitchen starts running out. */
  par: number;
  /** Which store it sits in, or `null` when the API does not say yet. */
  store: StoreId | null;
  supplier: string;
  /**
   * Who brings it, as an id the API knows.
   *
   * Optional because the fixture shelf has no supplier table behind it: the
   * demo names companies and cannot point at them. Present on a live row, and
   * it is what turns the row's "order" button from a toast into a document.
   */
  supplierId?: string | null;
  /**
   * The last movement, as the ledger recorded it, or `null` for an ingredient
   * nothing has happened to yet.
   *
   * Held apart rather than pre-formatted because the unit is translated —
   * `kg` in Uzbek and English, `кг` in Russian — and a string built here would
   * be a string built in one language. The screen puts the two together.
   */
  lastMove: StockMove | null;
};

/** One line of the ledger, in the unit the screen shows. */
export type StockMove = {
  /** Signed: positive in, negative out. */
  quantity: number;
  /** `HH:MM` when it happened today; `null` when it is older than that. */
  at: string | null;
  /**
   * True when the figure is in base units rather than purchase units.
   *
   * The design writes the cola line as `-42 dona`, not `-1.75 quti`
   * (`Smart Restaurant OS.dc.html:13423`), and it is right to: the fridge was
   * emptied by the bottle. A movement that says 42 against a column headed
   * "cases" is the kind of number that gets re-counted by hand.
   */
  base?: boolean;
};

export const STOCK: readonly StockRow[] = [
  {
    id: 'beef',
    name: 'Mol go‘shti, kurak',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(70_000),
    shelfLife: 4,
    onHand: 4.2,
    par: 18,
    store: 'main',
    supplier: "Farg'ona Meat",
    lastMove: { quantity: -6.4, at: null },
  },
  {
    id: 'lamb',
    name: 'Qo‘y go‘shti, son',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(92_000),
    shelfLife: 4,
    onHand: 11.5,
    par: 14,
    store: 'main',
    supplier: "Farg'ona Meat",
    lastMove: { quantity: -3.1, at: null },
  },
  {
    id: 'rice',
    name: 'Devzira guruch',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(30_000),
    shelfLife: 180,
    onHand: 11,
    par: 40,
    store: 'main',
    supplier: 'Osiyo Savdo',
    lastMove: { quantity: -9, at: null },
  },
  {
    id: 'mozzarella',
    name: 'Mozzarella',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(78_000),
    shelfLife: 14,
    onHand: 2.8,
    par: 10,
    store: 'kitchen',
    supplier: 'Milko',
    lastMove: { quantity: -2.2, at: null },
  },
  {
    id: 'tomato',
    name: 'Pomidor',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(12_000),
    shelfLife: 6,
    onHand: 26,
    par: 20,
    store: 'kitchen',
    supplier: 'Chorsu Bozor',
    lastMove: { quantity: 30, at: '08:10' },
  },
  {
    id: 'onion',
    name: 'Piyoz',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(6_000),
    shelfLife: 30,
    onHand: 41,
    par: 25,
    store: 'main',
    supplier: 'Chorsu Bozor',
    lastMove: { quantity: -5, at: null },
  },
  {
    id: 'flour',
    name: 'Un, oliy nav',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(9_500),
    shelfLife: 120,
    onHand: 68,
    par: 50,
    store: 'main',
    supplier: 'Osiyo Savdo',
    lastMove: { quantity: -12, at: null },
  },
  {
    id: 'cola',
    name: 'Coca-Cola 0.5',
    unit: 'unitCase',
    baseUnit: 'pcs',
    factor: 24,
    price: som(96_000),
    shelfLife: 240,
    onHand: 18,
    par: 96,
    store: 'bar',
    supplier: 'Coca-Cola UZ',
    lastMove: { quantity: -42, at: null, base: true },
  },
  {
    id: 'oil',
    name: 'Paxta yog‘i',
    unit: 'unitL',
    baseUnit: 'ml',
    factor: 1000,
    price: som(24_000),
    shelfLife: 200,
    onHand: 34,
    par: 30,
    store: 'main',
    supplier: 'Osiyo Savdo',
    lastMove: { quantity: -4, at: null },
  },
  {
    id: 'chicken',
    name: 'Tovuq filesi',
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: som(48_000),
    shelfLife: 3,
    onHand: 19,
    par: 16,
    store: 'kitchen',
    supplier: 'Parranda Plus',
    lastMove: { quantity: 20, at: '07:40' },
  },
];

/** The fixture shelf by id — the ledger below joins to it. */
const STOCK_BY_ID = new Map(STOCK.map((row) => [row.id, row]));

export const stockById = (id: string): StockRow | undefined => STOCK_BY_ID.get(id);

export type StockLevel = 'critical' | 'belowPar' | 'healthy';

/**
 * How worried to be about a line.
 *
 * Fractions of par rather than fixed quantities, because 4 kg of saffron and
 * 4 kg of onion are not the same news. Where the two bands sit, though, is not
 * the prototype's answer, and the difference matters.
 *
 * The prototype puts them at a third and a half of par, which reads correctly
 * against its own fixtures because everything low in them is *very* low. It
 * does not survive real data. `par` here is the reorder point — the line this
 * file has always described as "where the kitchen starts running out" — and the
 * server agrees: `min_quantity`, and an `is_low` flag that trips at or below it.
 * Under the old thresholds an ingredient sitting at two thirds of its reorder
 * point came out "healthy", so the seeded tomato — put below par on purpose, to
 * be the one red row on the screen — was drawn green while the API called it
 * low. One screen, two answers.
 *
 * At the reorder point, then: at or under it is below par, and under half of it
 * is critical. That agrees with `is_low` by construction, which is what stops
 * the strip above the table disagreeing with the table.
 */
export function levelOf(row: StockRow): StockLevel {
  const ratio = row.onHand / row.par;

  if (ratio < 0.5) return 'critical';
  if (ratio <= 1) return 'belowPar';

  return 'healthy';
}

export const LEVEL_RAIL: Record<StockLevel, string> = {
  critical: 'var(--danger-500)',
  belowPar: 'var(--warning-500)',
  healthy: 'var(--success-500)',
};

export const LEVEL_TONE = {
  critical: 'danger',
  belowPar: 'warning',
  healthy: 'success',
} as const;

/** The four figures above the table. Money in tiyin, as always. */
export const STOCK_SUMMARY = {
  valueTiyin: 6_420_000_000,
  // Five, not the prototype's four: the leg of lamb at 11.5 kg against a 14 kg
  // reorder point is below par, and only the old thresholds said otherwise.
  belowPar: 5,
  wasteTodayTiyin: 18_200_000,
  openPurchases: 8,
} as const;

/* ============================================================
   The ledger — `MOVES`, `Smart Restaurant OS.dc.html:14484`

   One list, drawn twice: as the Movements tab, and again inside the drawer
   filtered to the line that is open. Deliberately the same list, because the
   two disagreeing is a bug nobody can see — the tab would say the kitchen took
   1.44 kg of beef and the drawer would say something else about the same
   minute.
   ============================================================ */

export type Movement = {
  id: string;
  /** `HH:MM`. */
  at: string;
  /** The stock line it moved, by id. */
  item: string;
  /** Signed, in the line's purchase unit: positive in, negative out. */
  quantity: number;
  /** What caused it, already a sentence rather than a code. */
  source: Trilingual;
  /**
   * Who did it, or `null` when nobody did.
   *
   * `null` is the recipe card deducting a sold dish, and it is the majority of
   * a real day. The screen names it rather than leaving the cell blank: a blank
   * reads as data that failed to load, and this one is the system working.
   */
  who: string | null;
};

const SALE_OSH: Trilingual = {
  uz: 'Sotuv · 12 × Osh, beef',
  ru: 'Продажа · 12 × Плов с говядиной',
  en: 'Sale · 12 × Osh, beef',
};

export const MOVEMENTS: readonly Movement[] = [
  { id: 'mv1', at: '21:12', item: 'beef', quantity: -1.44, source: SALE_OSH, who: null },
  { id: 'mv2', at: '21:12', item: 'rice', quantity: -2.16, source: SALE_OSH, who: null },
  {
    id: 'mv3',
    at: '20:48',
    item: 'lamb',
    quantity: -1.8,
    source: {
      uz: 'Sotuv · 6 × Shashlik, lamb',
      ru: 'Продажа · 6 × Шашлык',
      en: 'Sale · 6 × Shashlik, lamb',
    },
    who: null,
  },
  {
    id: 'mv4',
    at: '20:31',
    item: 'mozzarella',
    quantity: -0.9,
    source: {
      uz: 'Sotuv · 5 × Pizza Margherita',
      ru: 'Продажа · 5 × Пицца Маргарита',
      en: 'Sale · 5 × Pizza Margherita',
    },
    who: null,
  },
  {
    id: 'mv5',
    at: '19:20',
    item: 'beef',
    quantity: -0.6,
    source: { uz: 'Chiqindi · kuyib ketdi', ru: 'Списание · пригорело', en: 'Waste · burnt' },
    who: 'Sardor N.',
  },
  {
    id: 'mv6',
    at: '18:05',
    item: 'onion',
    quantity: -5,
    source: {
      uz: "Ko'chirish · Yunusobodga",
      ru: 'Перемещение · в Юнусабад',
      en: 'Transfer · to Yunusobod',
    },
    who: 'Nodira A.',
  },
  {
    id: 'mv7',
    at: '14:40',
    item: 'tomato',
    quantity: 30,
    source: {
      uz: 'Qabul · Chorsu Bozor, HF-4471',
      ru: 'Приёмка · Чорсу, HF-4471',
      en: 'Receiving · Chorsu Bozor, HF-4471',
    },
    who: 'Nodira A.',
  },
  {
    id: 'mv8',
    at: '12:15',
    item: 'flour',
    quantity: -0.4,
    source: {
      uz: 'Korreksiya · sanoqda farq',
      ru: 'Корректировка · расхождение',
      en: 'Correction · count discrepancy',
    },
    who: 'Nodira A.',
  },
  {
    id: 'mv9',
    at: '07:40',
    item: 'chicken',
    quantity: 20,
    source: {
      uz: 'Qabul · Parranda Plus, PP-0871',
      ru: 'Приёмка · Parranda Plus, PP-0871',
      en: 'Receiving · Parranda Plus, PP-0871',
    },
    who: 'Nodira A.',
  },
];

/** This line's own history, newest first, as the drawer lists it. */
export const movementsOf = (item: string): readonly Movement[] =>
  MOVEMENTS.filter((move) => move.item === item);

/* ------------------------------------------------------------------ expiry */

/**
 * A delivered batch and the date it stops being food.
 *
 * The design's third inventory tab is **Muddat** — `ivTabs`,
 * `Smart Restaurant OS.dc.html:14510` — not the adjustment log this screen had
 * in its place. The two are not interchangeable: an adjustment is a number
 * somebody already changed, and this is the list of numbers that are about to
 * change themselves. A store keeps both, but only one of them is a thing to do
 * this morning.
 *
 * Stock is tracked per line, expiry per batch, which is why this is its own
 * list rather than a column: two deliveries of the same beef expire on
 * different days and writing one date against the line would throw away
 * whichever is sooner.
 *
 * Rows are `EXP` at `Smart Restaurant OS.dc.html:14474`, joined to the local
 * ids — the fixture above is that same INV list, in that same order.
 */
export type ExpiryBatch = {
  /** The stock line this batch belongs to. */
  item: string;
  /** The supplier's batch code, as it is printed on the box. */
  batch: string;
  quantity: number;
  /** `DD/MM`, as the design writes short dates. */
  arrived: string;
  expires: string;
  /** Days left. Two or fewer is red, five or fewer is amber. */
  left: number;
};

export const EXPIRY: readonly ExpiryBatch[] = [
  { item: 'beef', batch: 'FM-2214', quantity: 4.2, arrived: '13/08', expires: '17/08', left: 2 },
  { item: 'chicken', batch: 'PP-0871', quantity: 19, arrived: '14/08', expires: '17/08', left: 2 },
  {
    item: 'mozzarella',
    batch: 'ML-3390',
    quantity: 2.8,
    arrived: '08/08',
    expires: '22/08',
    left: 7,
  },
  { item: 'tomato', batch: 'CB-1102', quantity: 26, arrived: '14/08', expires: '20/08', left: 5 },
  { item: 'lamb', batch: 'FM-2215', quantity: 11.5, arrived: '14/08', expires: '18/08', left: 3 },
  { item: 'rice', batch: 'OS-7741', quantity: 11, arrived: '02/08', expires: '29/01', left: 167 },
  { item: 'oil', batch: 'OS-7742', quantity: 34, arrived: '28/07', expires: '12/02', left: 181 },
];

/** How many batches are inside the three-day window the KPI counts. */
export const expiringSoon = (): number => EXPIRY.filter((batch) => batch.left <= 3).length;

/**
 * Why a quantity was corrected.
 *
 * Six, in the design's order (`REASONS`, `Smart Restaurant OS.dc.html:14464`).
 * "Other" is last and deliberately vague — a reason list with no escape hatch
 * gets the nearest wrong answer picked instead, and then the log lies.
 */
export const CORRECTION_REASONS: readonly Trilingual[] = [
  { uz: 'Sanoqda farq', ru: 'Расхождение при пересчёте', en: 'Count discrepancy' },
  { uz: 'Yaroqsiz holga keldi', ru: 'Испортилось', en: 'Spoiled' },
  { uz: "To'kilib ketdi", ru: 'Пролилось или просыпалось', en: 'Spilled' },
  { uz: 'Kirim xatosi', ru: 'Ошибка при приёмке', en: 'Receiving error' },
  { uz: 'Xodim ovqati', ru: 'Питание персонала', en: 'Staff meal' },
  { uz: 'Boshqa', ru: 'Другое', en: 'Other' },
];

/**
 * Who a new line can be bought from (`SUPS`, `Smart Restaurant OS.dc.html:14507`).
 *
 * A closed list on purpose, and one shorter than the supplier module's: a
 * storekeeper adding an ingredient picks from who already delivers here, and
 * opening a free-text field is how the same butcher ends up in the ledger under
 * four spellings.
 */
export const ADD_SUPPLIERS: readonly string[] = [
  "Farg'ona Meat",
  'Osiyo Savdo',
  'Chorsu Bozor',
  'Milko',
  'Parranda Plus',
];

/**
 * The three base units a new line can be written in, with what one purchase
 * unit of each holds (`BASEU`, `buyU`, `fxDef` — `:14503`).
 *
 * The defaults are the whole point of the modal. Somebody adding rice should
 * not have to know that the system wants grams; it should already say grams,
 * and say what a kilogram of them is.
 */
export const ADD_BASE_UNITS: readonly {
  base: BaseUnit;
  /** What the design pre-fills the purchase-unit field with. */
  purchase: Trilingual;
  /** And the factor beside it. */
  factor: number;
}[] = [
  { base: 'g', purchase: { uz: 'kg', ru: 'kg', en: 'kg' }, factor: 1000 },
  { base: 'ml', purchase: { uz: 'l', ru: 'l', en: 'l' }, factor: 1000 },
  { base: 'pcs', purchase: { uz: 'quti', ru: 'ящик', en: 'case' }, factor: 24 },
];

/** Everything the store screen says that the console catalogue does not. */
export const STORE_COPY = {
  /* The chip strip, `Smart Restaurant OS.dc.html:11644` and `:9436-9494`. */
  allStores: { uz: 'Hammasi', ru: 'Все склады', en: 'All stores' },
  allNote: {
    uz: "Uch ombor · umumiy qoldiq va me'yor",
    ru: 'Три склада · общий остаток и норма',
    en: 'Three stores · combined stock and par',
  },
  keptBy: { uz: "mas'ul:", ru: 'ответственный:', en: 'kept by' },
  tabExpiry: { uz: 'Muddat', ru: 'Сроки', en: 'Expiry' },
  expSoon: { uz: 'Muddati tugayotgan', ru: 'Истекает срок', en: 'Expiring soon' },
  batches: { uz: 'partiya', ru: 'партии', en: 'batches' },
  colBatch: { uz: 'Partiya', ru: 'Партия', en: 'Batch' },
  colArrived: { uz: 'Kelgan', ru: 'Поступило', en: 'Arrived' },
  colExpires: { uz: 'Tugaydi', ru: 'Истекает', en: 'Expires' },
  colLeft: { uz: 'Qolgan', ru: 'Осталось', en: 'Left' },
  toWaste: { uz: 'Chiqindiga', ru: 'В списание', en: 'To waste' },
  wasted: { uz: 'chiqindiga yozildi', ru: 'списан', en: 'written off' },
  alreadyWasted: {
    uz: 'Bu partiya allaqachon yozilgan',
    ru: 'Эта партия уже списана',
    en: 'This batch is already written off',
  },
  days: { uz: 'kun', ru: 'дн.', en: 'days' },
  expiryEmpty: {
    uz: 'Muddati yaqinlashgan partiya yo‘q',
    ru: 'Партий с истекающим сроком нет',
    en: 'No batch is near its date',
  },

  /* The fourth unit, and the word for a countable base unit. Both are the
     design's own (`u`/`bu` in `INV`, `:13415`). */
  unitCase: { uz: 'quti', ru: 'ящик', en: 'case' },
  basePcs: { uz: 'dona', ru: 'шт', en: 'pcs' },
  som: { uz: "so'm", ru: 'сум', en: "so'm" },

  colStore: { uz: 'Ombor', ru: 'Склад', en: 'Store' },

  /* ------------------------------------------------------ movements tab */

  colChange: { uz: "O'zgarish", ru: 'Изменение', en: 'Change' },
  colSource: { uz: 'Sabab', ru: 'Источник', en: 'Source' },
  colBalance: { uz: 'Qoldiq', ru: 'Остаток', en: 'Balance' },
  auto: { uz: 'AVTOMATIK', ru: 'АВТО', en: 'AUTO' },
  system: { uz: 'Tizim', ru: 'Система', en: 'System' },
  autoNote: {
    uz: "Taom sotilganda xomashyo texnologik karta bo'yicha o'zi kamayadi — pastdagi «avtomatik» belgisi shuni ko'rsatadi. Qo'lda kiritish faqat qabul, chiqindi, inventarizatsiya va korreksiyada bo'ladi.",
    ru: 'При продаже блюда сырьё списывается по техкарте автоматически — на это указывает отметка «авто» ниже. Вручную вводятся только приёмка, списание, инвентаризация и корректировка.',
    en: 'When a dish sells, its ingredients deplete from the recipe card automatically — the «auto» tag below marks those. Only receiving, waste, counts and corrections are entered by hand.',
  },

  /* ----------------------------------------------------------- the drawer */

  cover: { uz: 'Yetadi', ru: 'Хватит на', en: 'Coverage' },
  units: { uz: "O'lchov birligi", ru: 'Единицы измерения', en: 'Units of measure' },
  unitsNote: {
    uz: "Retseptda asosiy birlik ishlatiladi, xaridda esa xarid birligi. Tizim ikkisini shu koeffitsient bilan o'zaro o'giradi.",
    ru: 'В рецепте используется базовая единица, в закупке — закупочная. Система переводит одну в другую по этому коэффициенту.',
    en: 'Recipes use the base unit, purchasing uses the purchase unit. The system converts between them with this factor.',
  },
  buyPrice: { uz: 'Xarid narxi', ru: 'Цена закупки', en: 'Purchase price' },
  basePrice: { uz: 'Asosiy birlik narxi', ru: 'Цена базовой единицы', en: 'Base unit price' },
  shelf: { uz: 'Yaroqlilik', ru: 'Срок годности', en: 'Shelf life' },
  itemMoves: {
    uz: 'Shu mahsulot harakatlari',
    ru: 'Движения по этому товару',
    en: 'Movements for this item',
  },
  itemMovesEmpty: {
    uz: 'Bugun bu mahsulotga hech narsa bo‘lmadi',
    ru: 'Сегодня по этому товару движений не было',
    en: 'Nothing happened to this item today',
  },
  corrHead: {
    uz: 'Qoldiqni tuzatish',
    ru: 'Корректировка остатка',
    en: 'Correct the stock level',
  },
  corrBody: {
    uz: "Korreksiya har doim sabab va hujjat bilan yoziladi — keyin kim, qachon va nima uchun o'zgartirganini ko'rish mumkin bo'ladi.",
    ru: 'Корректировка всегда фиксируется с причиной и документом — потом видно, кто, когда и почему изменил.',
    en: 'A correction is always recorded with a reason and a document, so it stays clear who changed what and why.',
  },
  corrOld: { uz: 'Tizimdagi qoldiq', ru: 'Остаток в системе', en: 'System quantity' },
  corrNew: { uz: 'Haqiqiy qoldiq', ru: 'Фактический остаток', en: 'Actual quantity' },
  corrWhy: { uz: 'Sabab', ru: 'Причина', en: 'Reason' },
  corrDoc: { uz: 'Hujjat yoki izoh', ru: 'Документ или примечание', en: 'Document or note' },
  corrDocPlaceholder: {
    uz: 'Masalan: akt 14/08, omborchi tekshirdi',
    ru: 'Например: акт 14/08, проверил кладовщик',
    en: 'e.g. report 14/08, checked by the storekeeper',
  },
  corrSave: {
    uz: 'Korreksiyani saqlash',
    ru: 'Сохранить корректировку',
    en: 'Save the correction',
  },
  corrNoDiff: {
    uz: "Farq yo'q",
    ru: 'Расхождения нет',
    en: 'No difference',
  },
  corrNeedNumber: {
    uz: 'Haqiqiy qoldiqni kiriting',
    ru: 'Введите фактический остаток',
    en: 'Enter the actual quantity',
  },
  corrNothingToDo: {
    uz: "Farq yo'q — korreksiya kerak emas",
    ru: 'Расхождения нет — корректировка не нужна',
    en: 'No difference — nothing to correct',
  },
  close: { uz: 'Yopish', ru: 'Закрыть', en: 'Close' },

  /* The order button, which the design gives three states rather than one
     toast: it drafts a purchase for the shortfall, it says how much and from
     whom, and afterwards it says the line is already on order. A button that
     only ever says "added" is a button somebody presses twice. */
  ordered: { uz: 'Buyurtmada', ru: 'В заказе', en: 'Ordered' },
  orderDrafted: {
    uz: 'Xarid buyurtmasi tuzildi: ',
    ru: 'Создан заказ: ',
    en: 'Purchase order drafted: ',
  },
  alreadyOrdered: {
    uz: ' allaqachon buyurtmada',
    ru: ' уже в заказе',
    en: ' is already on order',
  },

  /* ------------------------------------------------------ the add modal */

  add: { uz: "Xomashyo qo'shish", ru: 'Добавить сырьё', en: 'Add an item' },
  addHead: { uz: 'Yangi xomashyo', ru: 'Новое сырьё', en: 'New stock item' },
  addBody: {
    uz: "O'lchov birligini to'g'ri tanlash muhim: texnologik karta shu birlikda yoziladi va keyin o'zgartirish qiyin bo'ladi.",
    ru: 'Важно правильно выбрать единицу: техкарта пишется в ней, и менять её потом сложно.',
    en: 'Choosing the unit correctly matters: the recipe card is written in it, and changing it later is painful.',
  },
  addName: { uz: 'Nomi', ru: 'Название', en: 'Name' },
  addNamePlaceholder: {
    uz: "Masalan: Mol go'shti, yelka",
    ru: 'Например: Говядина, лопатка',
    en: 'e.g. Beef, shoulder',
  },
  addBase: {
    uz: 'Asosiy birlik (retsept uchun)',
    ru: 'Базовая единица (для рецепта)',
    en: 'Base unit (for recipes)',
  },
  addBaseNote: {
    uz: 'Suyuqlik uchun millilitr, quruq mahsulot uchun gramm, sanaladigan mahsulot uchun dona.',
    ru: 'Для жидкостей — миллилитры, для сухих — граммы, для считаемых — штуки.',
    en: 'Millilitres for liquids, grams for dry goods, pieces for countable items.',
  },
  addBuy: { uz: 'Xarid birligi', ru: 'Закупочная единица', en: 'Purchase unit' },
  addFactor: { uz: 'Koeffitsient', ru: 'Коэффициент', en: 'Factor' },
  addPrice: {
    uz: 'Narx (xarid birligi uchun)',
    ru: 'Цена (за закупочную ед.)',
    en: 'Price per purchase unit',
  },
  addMin: { uz: 'Minimal qoldiq', ru: 'Минимальный остаток', en: 'Minimum level' },
  addShelf: { uz: 'Yaroqlilik, kun', ru: 'Срок, дней', en: 'Shelf life, days' },
  addSave: { uz: "Qo'shish", ru: 'Добавить', en: 'Add' },
  cancel: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  addNeedName: {
    uz: 'Xomashyo nomini kiriting',
    ru: 'Введите название сырья',
    en: 'Enter the item name',
  },
  addShortName: {
    uz: "Nom kamida 3 harfdan bo'lishi kerak",
    ru: 'Название минимум 3 символа',
    en: 'The name needs at least 3 characters',
  },
  addBadFactor: {
    uz: "Koeffitsient noldan katta bo'lishi kerak",
    ru: 'Коэффициент должен быть больше нуля',
    en: 'The factor must be greater than zero',
  },
  added: { uz: "qo'shildi", ru: 'Сырьё добавлено', en: 'Item added' },
} as const satisfies Record<string, Trilingual>;

/**
 * What the toast says once a line is added.
 *
 * Uzbek puts the name in front and the other two do not, which is the design's
 * own wording (`saveAdd`, `Smart Restaurant OS.dc.html:14588`) rather than a
 * translation that went missing: `qo'shildi` is a bare verb that needs its
 * subject, while `Сырьё добавлено` and `Item added` are already sentences.
 */
export const addedToast = (name: string, conversion: string, lang: Lang): string =>
  lang === 'uz'
    ? `${name} · ${say(STORE_COPY.added, lang)} · ${conversion}`
    : `${say(STORE_COPY.added, lang)} · ${conversion}`;
