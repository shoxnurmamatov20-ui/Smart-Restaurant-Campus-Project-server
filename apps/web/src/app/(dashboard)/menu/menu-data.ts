import type { Messages } from '@/i18n';

/**
 * The menu, as the design's screen lists it.
 *
 * Prices and costs are integer tiyin. The margin is not stored: it is
 * `(price − cost) / price`, and holding a derived figure alongside the two it
 * derives from is how a menu ends up claiming a margin its own numbers deny.
 *
 * Wired to `GET /api/v1/menu/items` — see `./menu-server.ts`. The list below is what the screen draws when there is no session: the
 * Menu module is the canonical one (apps/api/Modules/Menu), so this was the
 * first screen the real API replaced and the shape the rest follow.
 */

type Menu = Messages['console']['menu'];

export type MenuRow = {
  id: string;
  /** A dish name is a proper noun; it is not translated. */
  name: string;
  category: keyof Pick<
    Menu,
    'catNational' | 'catBurgers' | 'catLavash' | 'catPizza' | 'catSalads' | 'catDrinks'
  >;
  station: keyof Pick<
    Menu,
    | 'stationHot'
    | 'stationGrill'
    | 'stationCold'
    | 'stationTandoor'
    | 'stationSteam'
    | 'stationPizza'
    | 'stationBar'
  >;
  price: number;
  cost: number;
  /** False when the kitchen has 86'd it — the stop list. */
  available: boolean;
  soldToday: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const MENU_ITEMS: readonly MenuRow[] = [
  {
    id: 'osh',
    name: 'Osh, beef',
    category: 'catNational',
    station: 'stationHot',
    price: som(42_000),
    cost: som(15_400),
    available: true,
    soldToday: 64,
  },
  {
    id: 'lagmon',
    name: "Lag'mon",
    category: 'catNational',
    station: 'stationHot',
    price: som(38_000),
    cost: som(13_100),
    available: true,
    soldToday: 22,
  },
  {
    id: 'somsa',
    name: 'Somsa, beef',
    category: 'catNational',
    station: 'stationTandoor',
    price: som(12_000),
    cost: som(4_300),
    available: true,
    soldToday: 38,
  },
  {
    id: 'manti',
    name: 'Manti',
    category: 'catNational',
    station: 'stationSteam',
    price: som(40_000),
    cost: som(14_800),
    available: true,
    soldToday: 19,
  },
  {
    id: 'shashlik',
    name: 'Shashlik, lamb',
    category: 'catNational',
    station: 'stationGrill',
    price: som(35_000),
    cost: som(16_200),
    available: true,
    soldToday: 27,
  },
  {
    id: 'cheeseburger',
    name: 'Cheeseburger',
    category: 'catBurgers',
    station: 'stationGrill',
    price: som(39_000),
    cost: som(15_900),
    available: true,
    soldToday: 47,
  },
  {
    id: 'double-beef',
    name: 'Double beef',
    category: 'catBurgers',
    station: 'stationGrill',
    price: som(58_000),
    cost: som(26_800),
    available: false,
    soldToday: 12,
  },
  {
    id: 'lavash',
    name: 'Lavash, classic',
    category: 'catLavash',
    station: 'stationCold',
    price: som(32_000),
    cost: som(11_200),
    available: true,
    soldToday: 51,
  },
  {
    id: 'margherita',
    name: 'Margherita',
    category: 'catPizza',
    station: 'stationPizza',
    price: som(68_000),
    cost: som(21_400),
    available: true,
    soldToday: 29,
  },
  {
    id: 'pepperoni',
    name: 'Pepperoni',
    category: 'catPizza',
    station: 'stationPizza',
    price: som(82_000),
    cost: som(29_900),
    available: true,
    soldToday: 17,
  },
  {
    id: 'caesar',
    name: 'Caesar',
    category: 'catSalads',
    station: 'stationCold',
    price: som(34_000),
    cost: som(12_600),
    available: true,
    soldToday: 14,
  },
  {
    id: 'green-tea',
    name: 'Green tea',
    category: 'catDrinks',
    station: 'stationBar',
    price: som(8_000),
    cost: som(900),
    available: true,
    soldToday: 88,
  },
];

/**
 * What the kitchen keeps of every so'm the dish takes, as a percentage.
 *
 * Takes the two figures rather than a row, so it serves a fixture and an API
 * row alike. Guards the divide: an item priced at zero — a staff meal, a
 * sample — would otherwise render `NaN%` or `Infinity%` in a money column.
 */
export const marginOf = (item: { price: number; cost: number }): number =>
  item.price === 0 ? 0 : Math.round(((item.price - item.cost) / item.price) * 100);

/* ============================================================
   The three tabs beside the item list — `specs/01-os.md §5.6`

   The module shipped one table. Modifiers, categories and import are the three
   things a restaurant does to a menu *after* the dishes exist, and the last one
   is how the dishes get there in the first place.
   ============================================================ */

export type ModifierOption = {
  id: string;
  /** An option's name is written by the restaurant; not translated. */
  name: string;
  /** Tiyin. Zero for a choice that costs nothing, negative for a discount. */
  price: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  /** How many of the options a guest must pick, and may pick. */
  min: number;
  max: number;
  options: readonly ModifierOption[];
  /** Which dishes carry it. */
  usedBy: number;
  /**
   * Whether the sheet is switched on.
   *
   * Optional because the fixture groups are all live and have nothing to say
   * about it; the API sends it, and a group somebody disabled in March is
   * exactly the row this tab exists to surface — hiding it would read as
   * deleted.
   */
  active?: boolean;
};

export const MODIFIER_GROUPS: readonly ModifierGroup[] = [
  {
    id: 'portion',
    name: 'Ulush',
    /*
     * min 1, max 1 — a portion is a choice, not an extra. That distinction is
     * the whole reason the two numbers exist: a group with min 0 is optional
     * and a group with min 1 blocks the line until somebody answers.
     */
    min: 1,
    max: 1,
    usedBy: 24,
    options: [
      { id: 'one', name: 'Bir kishilik', price: 0 },
      { id: 'large', name: 'Kattalashtirilgan', price: 18_000_00 },
      { id: 'two', name: 'Ikki kishilik tovoq', price: 42_000_00 },
    ],
  },
  {
    id: 'extras',
    name: "Qo'shimchalar",
    min: 0,
    max: 4,
    usedBy: 31,
    options: [
      { id: 'meat', name: "Qo'shimcha go'sht", price: 18_000_00 },
      { id: 'cheese', name: 'Ikki hissa pishloq', price: 9_000_00 },
      { id: 'sauce', name: 'Sous alohida', price: 4_000_00 },
      { id: 'bread', name: "Qo'shimcha non", price: 3_000_00 },
    ],
  },
  {
    id: 'prep',
    name: 'Tayyorlash',
    min: 0,
    max: 3,
    usedBy: 47,
    options: [
      { id: 'noonion', name: 'Piyozsiz', price: 0 },
      { id: 'spicy', name: 'Achchiqroq', price: 0 },
      { id: 'nosalt', name: 'Kam tuzli', price: 0 },
    ],
  },
];

export type CategoryRow = {
  id: string;
  name: string;
  /** Where it sits in the menu, and on the board. */
  position: number;
  items: number;
  /** Hidden categories keep their dishes and leave the guest surfaces. */
  visible: boolean;
};

export const CATEGORIES: readonly CategoryRow[] = [
  { id: 'national', name: 'Milliy taomlar', position: 1, items: 18, visible: true },
  { id: 'grill', name: 'Kabob', position: 2, items: 9, visible: true },
  { id: 'burgers', name: 'Burgerlar', position: 3, items: 7, visible: true },
  { id: 'lavash', name: 'Lavash', position: 4, items: 5, visible: true },
  { id: 'pizza', name: 'Pitsa', position: 5, items: 11, visible: true },
  { id: 'salads', name: 'Salatlar', position: 6, items: 6, visible: true },
  { id: 'drinks', name: 'Ichimliklar', position: 7, items: 14, visible: true },
  { id: 'seasonal', name: 'Mavsumiy', position: 8, items: 4, visible: false },
];

/**
 * The columns an import file must carry, and what each is for.
 *
 * `specs/01-os.md §5.6` calls for a template and a column mapping, and the
 * mapping is the part that matters: a restaurant sends a spreadsheet its
 * accountant made, and the column called «Наименование» has to become `name`
 * without anybody editing the file.
 */
export const IMPORT_COLUMNS: readonly { key: string; required: boolean }[] = [
  { key: 'name', required: true },
  { key: 'category', required: true },
  { key: 'price', required: true },
  { key: 'cost', required: false },
  { key: 'station', required: false },
  { key: 'allergens', required: false },
];

/** How many dishes the starter template carries. */
export const STARTER_TEMPLATE_DISHES = 68;
