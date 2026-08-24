/**
 * Stock operations — everything that actually moves a number in the store.
 *
 * The design's `ops` module. `specs/01-os.md §5.8` names five tabs; the design
 * file draws **seven**, adding prep items and the adjustment log, and the
 * handoff's rule is that the file wins. All seven are here.
 *
 * The five that change stock — receiving, counting, waste, transfers,
 * corrections — are the only ways a quantity changes by hand. Everything else
 * is the recipe card doing it automatically when a dish sells, which is why the
 * recipe tab is not an add-on but the thing the other six exist around: without
 * it, consumption has to be typed, and a store where consumption is typed is a
 * store whose numbers are a guess by Thursday.
 *
 * One rule is worth stating because the screen enforces it: during a stock
 * count the system quantity is hidden. Somebody counting a shelf while looking
 * at what the computer expects will find what the computer expects. The
 * variance is computed after the number is in, never before.
 *
 * Fixtures. `inventory.stock_items` exists and is seeded, but there is no
 * endpoint for a count sheet, a waste line, a transfer or a recipe card.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** 1 UZS = 100 tiyin. */
export const som = (value: number): number => value * 100;

/* ------------------------------------------------------------------ stock */

export type Unit = 'kg' | 'l' | 'pcs' | 'case';

/**
 * A raw good, priced in its purchase unit.
 *
 * `perBase` is what the recipe card multiplies by, and it is derived rather
 * than stored: beef is bought by the kilogram and cooked by the gram, and a
 * hand-entered "70 so'm per gram" beside "70 000 so'm per kg" is two numbers
 * that will disagree the first time a price changes.
 */
export type Ingredient = {
  key: string;
  name: Trilingual;
  unit: Unit;
  /** Base units in one purchase unit: 1000 g in a kg, 24 bottles in a case. */
  factor: number;
  /** Tiyin, per purchase unit. */
  price: number;
};

export const INGREDIENTS: readonly Ingredient[] = [
  {
    key: 'beef',
    name: { uz: "Mol go'shti, kurak", ru: 'Говядина, лопатка', en: 'Beef, shoulder' },
    unit: 'kg',
    factor: 1000,
    price: som(70_000),
  },
  {
    key: 'lamb',
    name: { uz: "Qo'y go'shti, son", ru: 'Баранина, нога', en: 'Lamb, leg' },
    unit: 'kg',
    factor: 1000,
    price: som(92_000),
  },
  {
    key: 'rice',
    name: { uz: 'Devzira guruch', ru: 'Рис девзира', en: 'Devzira rice' },
    unit: 'kg',
    factor: 1000,
    price: som(30_000),
  },
  {
    key: 'mozzarella',
    name: { uz: 'Mozzarella', ru: 'Моцарелла', en: 'Mozzarella' },
    unit: 'kg',
    factor: 1000,
    price: som(78_000),
  },
  {
    key: 'tomato',
    name: { uz: 'Pomidor', ru: 'Помидор', en: 'Tomato' },
    unit: 'kg',
    factor: 1000,
    price: som(12_000),
  },
  {
    key: 'onion',
    name: { uz: 'Piyoz', ru: 'Лук', en: 'Onion' },
    unit: 'kg',
    factor: 1000,
    price: som(6_000),
  },
  {
    key: 'flour',
    name: { uz: 'Un, oliy nav', ru: 'Мука, высший сорт', en: 'Flour, first grade' },
    unit: 'kg',
    factor: 1000,
    price: som(9_500),
  },
  {
    key: 'cola',
    name: { uz: 'Coca-Cola 0.5', ru: 'Coca-Cola 0.5', en: 'Coca-Cola 0.5' },
    unit: 'case',
    factor: 24,
    price: som(96_000),
  },
  {
    key: 'oil',
    name: { uz: "Kungaboqar yog'i", ru: 'Подсолнечное масло', en: 'Sunflower oil' },
    unit: 'l',
    factor: 1000,
    price: som(24_000),
  },
  {
    key: 'chicken',
    name: { uz: 'Tovuq filesi', ru: 'Куриное филе', en: 'Chicken fillet' },
    unit: 'kg',
    factor: 1000,
    price: som(48_000),
  },
];

export const BY_KEY: ReadonlyMap<string, Ingredient> = new Map(
  INGREDIENTS.map((item) => [item.key, item]),
);

/** Tiyin per base unit — per gram, per millilitre, per bottle. */
export const perBase = (item: Ingredient): number => item.price / item.factor;

/* -------------------------------------------------------------- receiving */

export type DeliveryLine = {
  ingredient: string;
  /** Purchase units, as written on the supplier's document. */
  ordered: number;
  received: number;
};

export type Delivery = {
  id: string;
  supplier: string;
  time: string;
  lines: readonly DeliveryLine[];
};

export const DELIVERIES: readonly Delivery[] = [
  {
    id: 'INV-4862',
    supplier: "Farg'ona Meat",
    time: '08:40',
    lines: [
      { ingredient: 'beef', ordered: 40, received: 38 },
      { ingredient: 'lamb', ordered: 25, received: 25 },
      { ingredient: 'chicken', ordered: 30, received: 30 },
    ],
  },
  {
    id: 'INV-4871',
    supplier: 'Chorsu Bozor',
    time: '09:15',
    lines: [
      { ingredient: 'onion', ordered: 40, received: 36 },
      { ingredient: 'tomato', ordered: 20, received: 20 },
      { ingredient: 'rice', ordered: 50, received: 50 },
    ],
  },
];

/** What a short delivery costs, at the price the invoice charges. */
export const shortfallValue = (delivery: Delivery): number =>
  delivery.lines.reduce((total, line) => {
    const item = BY_KEY.get(line.ingredient);
    const missing = line.ordered - line.received;

    return item && missing > 0 ? total + missing * item.price : total;
  }, 0);

/* ------------------------------------------------------------ stock count */

export type CountRow = {
  ingredient: string;
  /**
   * What the system thinks is on the shelf, in purchase units.
   *
   * Never rendered until a counted figure is in. The field exists here because
   * the variance needs it; the screen's job is to keep it off the page while
   * somebody is counting.
   */
  system: number;
};

export const COUNT_SHEET: readonly CountRow[] = [
  { ingredient: 'beef', system: 62 },
  { ingredient: 'rice', system: 140 },
  { ingredient: 'oil', system: 48 },
  { ingredient: 'onion', system: 75 },
  { ingredient: 'tomato', system: 90 },
  { ingredient: 'flour', system: 120 },
];

/**
 * The variance a manager has to sign for, as a fraction.
 *
 * Five per cent. Below it a storekeeper closes their own count; above it the
 * PIN keypad opens. The threshold is the whole control: without one, either
 * every count waits on a manager or none of them do.
 */
export const VARIANCE_CEILING = 0.05;

export const needsApproval = (system: number, counted: number): boolean =>
  system > 0 && Math.abs(counted - system) / system > VARIANCE_CEILING;

/* ------------------------------------------------------------------ waste */

export type WasteReason = 'expired' | 'spoiled' | 'broken' | 'cooking' | 'returned';

export const WASTE_REASONS: readonly WasteReason[] = [
  'expired',
  'spoiled',
  'broken',
  'cooking',
  'returned',
];

export type WasteEntry = {
  id: string;
  time: string;
  name: Trilingual;
  /** Already phrased with its unit — waste is entered in whatever was thrown out. */
  quantity: string;
  reason: WasteReason;
  /** Tiyin. */
  cost: number;
};

export const WASTE_LOG: readonly WasteEntry[] = [
  {
    id: 'w-1',
    time: '10:20',
    name: { uz: "Ko'katlar", ru: 'Зелень', en: 'Herbs' },
    quantity: '1.2 kg',
    reason: 'expired',
    cost: som(48_000),
  },
  {
    id: 'w-2',
    time: '09:45',
    name: { uz: 'Sut', ru: 'Молоко', en: 'Milk' },
    quantity: '3 l',
    reason: 'spoiled',
    cost: som(36_000),
  },
  {
    id: 'w-3',
    time: 'yest.',
    name: { uz: 'Manti', ru: 'Манты', en: 'Manti' },
    quantity: '6',
    reason: 'returned',
    cost: som(96_000),
  },
];

/* --------------------------------------------------------------- transfer */

export type TransferState = 'inTransit' | 'received' | 'delivered';

export type Transfer = {
  id: string;
  time: string;
  what: Trilingual;
  /** Where it went, already joined with an arrow. */
  route: string;
  state: TransferState;
};

export const BRANCHES: readonly { key: string; name: string }[] = [
  { key: 'chilonzor', name: 'Chilonzor' },
  { key: 'yunusobod', name: 'Yunusobod' },
  { key: 'sergeli', name: 'Sergeli' },
  { key: 'mirzo', name: "Mirzo Ulug'bek" },
  { key: 'termiz', name: 'Termiz' },
];

export const TRANSFERS: readonly Transfer[] = [
  {
    id: 't-1',
    time: '11:40',
    what: { uz: 'Mozzarella · 3 kg', ru: 'Моцарелла · 3 кг', en: 'Mozzarella · 3 kg' },
    route: 'Chilonzor → Yunusobod',
    state: 'received',
  },
  {
    id: 't-2',
    time: '09:10',
    what: { uz: 'Devzira guruch · 25 kg', ru: 'Рис девзира · 25 кг', en: 'Devzira rice · 25 kg' },
    route: 'Chilonzor → Termiz',
    state: 'delivered',
  },
  {
    id: 't-3',
    time: 'yest.',
    what: {
      uz: "Kungaboqar yog'i · 20 l",
      ru: 'Подсолнечное масло · 20 л',
      en: 'Sunflower oil · 20 l',
    },
    route: 'Yunusobod → Sergeli',
    state: 'delivered',
  },
];

/* ------------------------------------------------------------ prep items */

export type PrepItem = {
  key: string;
  name: Trilingual;
  /** The base unit one batch is measured in. */
  unit: 'g' | 'ml';
  /** What one batch yields, before loss. */
  batch: number;
  /** Cooking loss as a percentage — water, trim, evaporation. */
  lossPercent: number;
  shelfDays: number;
  /** How much is on hand right now, in base units. */
  onHand: number;
  lines: readonly { ingredient: string; quantity: number }[];
};

export const PREP_ITEMS: readonly PrepItem[] = [
  {
    key: 'zirvak',
    name: { uz: 'Zirvak', ru: 'Зирвак', en: 'Zirvak' },
    unit: 'g',
    batch: 1000,
    lossPercent: 12,
    shelfDays: 2,
    onHand: 2400,
    lines: [
      { ingredient: 'beef', quantity: 400 },
      { ingredient: 'onion', quantity: 250 },
      { ingredient: 'tomato', quantity: 150 },
      { ingredient: 'oil', quantity: 120 },
    ],
  },
  {
    key: 'broth',
    name: { uz: 'Qaynatma, mol', ru: 'Бульон говяжий', en: 'Beef broth' },
    unit: 'ml',
    batch: 8000,
    lossPercent: 18,
    shelfDays: 2,
    onHand: 1600,
    lines: [
      { ingredient: 'beef', quantity: 1200 },
      { ingredient: 'onion', quantity: 300 },
      { ingredient: 'tomato', quantity: 200 },
    ],
  },
  {
    key: 'dough',
    name: { uz: 'Xamir', ru: 'Тесто', en: 'Dough' },
    unit: 'g',
    batch: 12_000,
    lossPercent: 4,
    shelfDays: 1,
    onHand: 0,
    lines: [
      { ingredient: 'flour', quantity: 8000 },
      { ingredient: 'oil', quantity: 250 },
    ],
  },
  {
    key: 'mince',
    name: { uz: 'Qiyma, aralash', ru: 'Фарш смешанный', en: 'Mixed mince' },
    unit: 'g',
    batch: 5000,
    lossPercent: 8,
    shelfDays: 1,
    onHand: 3200,
    lines: [
      { ingredient: 'beef', quantity: 3000 },
      { ingredient: 'lamb', quantity: 1500 },
      { ingredient: 'onion', quantity: 600 },
    ],
  },
];

export const PREP_BY_KEY: ReadonlyMap<string, PrepItem> = new Map(
  PREP_ITEMS.map((item) => [item.key, item]),
);

/** What one batch of raw goods costs, in tiyin. */
export const batchCost = (item: PrepItem): number =>
  item.lines.reduce((total, line) => {
    const raw = BY_KEY.get(line.ingredient);
    return raw ? total + line.quantity * perBase(raw) : total;
  }, 0);

/**
 * Cost per usable base unit, after loss.
 *
 * Dividing by the batch size rather than the yield would understate every dish
 * that uses it: eight litres of broth simmered down to six-and-a-half still
 * cost what eight litres of beef and onion cost.
 */
export const prepUnitCost = (item: PrepItem): number =>
  batchCost(item) / (item.batch * (1 - item.lossPercent / 100));

/* ----------------------------------------------------------- recipe cards */

export type RecipeLine =
  | { kind: 'raw'; ingredient: string; quantity: number }
  | { kind: 'prep'; prep: string; quantity: number };

export type Recipe = {
  key: string;
  name: Trilingual;
  /** Menu price, tiyin. */
  sell: number;
  lines: readonly RecipeLine[];
};

export const RECIPES: readonly Recipe[] = [
  {
    key: 'osh',
    name: { uz: "Osh, mol go'shti", ru: 'Плов с говядиной', en: 'Osh, beef' },
    sell: som(45_000),
    lines: [
      { kind: 'raw', ingredient: 'rice', quantity: 200 },
      { kind: 'prep', prep: 'zirvak', quantity: 260 },
      { kind: 'raw', ingredient: 'onion', quantity: 40 },
      { kind: 'raw', ingredient: 'oil', quantity: 20 },
    ],
  },
  {
    key: 'shashlik',
    name: { uz: "Shashlik, qo'y", ru: 'Шашлык из баранины', en: 'Shashlik, lamb' },
    sell: som(52_000),
    lines: [
      { kind: 'raw', ingredient: 'lamb', quantity: 220 },
      { kind: 'raw', ingredient: 'onion', quantity: 40 },
      { kind: 'raw', ingredient: 'oil', quantity: 10 },
    ],
  },
  {
    key: 'manti',
    name: { uz: 'Manti', ru: 'Манты', en: 'Manti' },
    sell: som(38_000),
    lines: [
      { kind: 'raw', ingredient: 'flour', quantity: 120 },
      { kind: 'raw', ingredient: 'beef', quantity: 150 },
      { kind: 'raw', ingredient: 'onion', quantity: 80 },
    ],
  },
  {
    key: 'lagmon',
    name: { uz: "Lag'mon", ru: 'Лагман', en: "Lag'mon" },
    sell: som(42_000),
    lines: [
      { kind: 'raw', ingredient: 'flour', quantity: 150 },
      { kind: 'raw', ingredient: 'beef', quantity: 120 },
      { kind: 'raw', ingredient: 'tomato', quantity: 100 },
      { kind: 'raw', ingredient: 'onion', quantity: 60 },
      { kind: 'raw', ingredient: 'oil', quantity: 25 },
    ],
  },
  {
    key: 'burger',
    name: { uz: "Burger, mol go'shti", ru: 'Бургер с говядиной', en: 'Burger, beef' },
    sell: som(22_000),
    lines: [
      { kind: 'raw', ingredient: 'beef', quantity: 150 },
      { kind: 'raw', ingredient: 'mozzarella', quantity: 30 },
      { kind: 'raw', ingredient: 'tomato', quantity: 40 },
      { kind: 'raw', ingredient: 'oil', quantity: 10 },
    ],
  },
];

/** What one line of a recipe costs, in tiyin. */
export function lineCost(line: RecipeLine): number {
  if (line.kind === 'prep') {
    const prep = PREP_BY_KEY.get(line.prep);
    return prep ? line.quantity * prepUnitCost(prep) : 0;
  }

  const raw = BY_KEY.get(line.ingredient);
  return raw ? line.quantity * perBase(raw) : 0;
}

export const recipeCost = (recipe: Recipe): number =>
  recipe.lines.reduce((total, line) => total + lineCost(line), 0);

/** Gross margin as a percentage of the menu price. */
export const marginPercent = (recipe: Recipe): number =>
  recipe.sell > 0 ? ((recipe.sell - recipeCost(recipe)) / recipe.sell) * 100 : 0;

/** Food cost — the same figure the other way up, which is how a chef reads it. */
export const foodCostPercent = (recipe: Recipe): number =>
  recipe.sell > 0 ? (recipeCost(recipe) / recipe.sell) * 100 : 0;

/**
 * Below this, the dish is a problem rather than a choice.
 *
 * Forty per cent. The design says it in one line under the card — "revisit the
 * price or the recipe" — and the number is on the screen because a chef who has
 * to work it out will not.
 */
export const MARGIN_FLOOR = 40;

/* ------------------------------------------------------- adjustment log */

export type AdjustmentKind = 'receiving' | 'count' | 'waste' | 'transfer' | 'correction';

export type Adjustment = {
  id: string;
  time: string;
  kind: AdjustmentKind;
  what: Trilingual;
  /** Signed, in the item's purchase unit, already phrased. */
  delta: string;
  who: string;
};

/**
 * Every by-hand change, in one list.
 *
 * The point of the tab is what is *not* on it: a sale never appears, because a
 * sale deducts by recipe. Anything here is somebody's decision, and it has
 * their name against it.
 */
export const ADJUSTMENTS: readonly Adjustment[] = [
  {
    id: 'a-1',
    time: '11:40',
    kind: 'transfer',
    what: { uz: 'Mozzarella', ru: 'Моцарелла', en: 'Mozzarella' },
    delta: '−3 kg',
    who: 'Sardor Nazarov',
  },
  {
    id: 'a-2',
    time: '10:20',
    kind: 'waste',
    what: { uz: "Ko'katlar", ru: 'Зелень', en: 'Herbs' },
    delta: '−1.2 kg',
    who: 'Bekzod Alimov',
  },
  {
    id: 'a-3',
    time: '09:15',
    kind: 'receiving',
    what: { uz: 'Piyoz', ru: 'Лук', en: 'Onion' },
    delta: '+36 kg',
    who: 'Sardor Nazarov',
  },
  {
    id: 'a-4',
    time: '08:40',
    kind: 'receiving',
    what: { uz: "Mol go'shti", ru: 'Говядина', en: 'Beef' },
    delta: '+38 kg',
    who: 'Sardor Nazarov',
  },
  {
    id: 'a-5',
    time: 'yest.',
    kind: 'correction',
    what: { uz: 'Devzira guruch', ru: 'Рис девзира', en: 'Devzira rice' },
    delta: '−4 kg',
    who: 'Aziza Rasulova',
  },
];

/**
 * The tab keys, here and not in stock-ops-tabs.tsx: that file is `'use client'`,
 * and a constant exported from a client module reaches a server page as a
 * client *reference*, not a value — `TAB_ORDER.find is not a function` was the
 * whole operations screen answering 500.
 */
export type TabKey = 'recv' | 'count' | 'waste' | 'move' | 'recipe' | 'prep' | 'log';

export const TAB_ORDER: readonly TabKey[] = [
  'recv',
  'count',
  'waste',
  'move',
  'recipe',
  'prep',
  'log',
];
