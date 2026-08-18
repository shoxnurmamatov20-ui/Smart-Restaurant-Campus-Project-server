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
