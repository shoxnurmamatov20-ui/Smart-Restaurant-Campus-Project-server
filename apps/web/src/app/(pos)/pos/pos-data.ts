import type { Messages } from '@/i18n';

import { TABLES, type Table } from '../../(dashboard)/tables/tables-data';

/**
 * What the POS sells, and where it sells it.
 *
 * The catalogue is the same one the Menu module owns — this is a read of it,
 * not a second copy. `is86` is the field the stop list writes, and it is the
 * reason the POS cannot cache the menu for a shift: an item goes off in the
 * kitchen and this screen has to know within the second.
 *
 * Money is integer tiyin, so a 10% service charge is integer arithmetic and a
 * bill split three ways still adds back up to the bill.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type CategoryId = 'national' | 'burgers' | 'lavash' | 'pizza' | 'salads' | 'drinks';

export type Category = {
  id: CategoryId;
  /** Message key into `console.menu`. */
  label: keyof Messages['console']['menu'];
};

export type MenuItem = {
  id: string;
  /** A dish name is a proper noun; it is not translated. */
  name: string;
  category: CategoryId;
  price: number;
  /** Off the menu right now — the kitchen pulled it. */
  is86: boolean;
};

export type Modifier = {
  id: string;
  label: keyof Messages['console']['pos'];
  /** What it adds to the line, in tiyin. Zero for a preparation note. */
  price: number;
};

export const CATEGORIES: readonly Category[] = [
  { id: 'national', label: 'catNational' },
  { id: 'burgers', label: 'catBurgers' },
  { id: 'lavash', label: 'catLavash' },
  { id: 'pizza', label: 'catPizza' },
  { id: 'salads', label: 'catSalads' },
  { id: 'drinks', label: 'catDrinks' },
];

export const MODIFIERS: readonly Modifier[] = [
  { id: 'meat', label: 'modMeat', price: som(12_000) },
  { id: 'cheese', label: 'modCheese', price: som(8_000) },
  { id: 'noonion', label: 'modNoOnion', price: 0 },
  { id: 'spicy', label: 'modSpicy', price: 0 },
  { id: 'sauce', label: 'modSauce', price: 0 },
];

export const MENU: readonly MenuItem[] = [
  { id: 'osh', name: 'Osh, beef', category: 'national', price: som(42_000), is86: false },
  { id: 'manti', name: 'Manti', category: 'national', price: som(38_000), is86: false },
  { id: 'lagmon', name: "Lag'mon", category: 'national', price: som(36_000), is86: false },
  { id: 'shashlik', name: 'Shashlik, lamb', category: 'national', price: som(54_000), is86: false },
  { id: 'somsa', name: 'Somsa, beef', category: 'national', price: som(12_000), is86: true },
  { id: 'norin', name: 'Norin', category: 'national', price: som(34_000), is86: false },

  { id: 'burger', name: 'Cheeseburger', category: 'burgers', price: som(39_000), is86: false },
  { id: 'double', name: 'Double beef', category: 'burgers', price: som(52_000), is86: false },
  {
    id: 'chickburger',
    name: 'Chicken burger',
    category: 'burgers',
    price: som(35_000),
    is86: false,
  },

  { id: 'lavashc', name: 'Lavash, classic', category: 'lavash', price: som(32_000), is86: false },
  { id: 'lavashch', name: 'Lavash, chicken', category: 'lavash', price: som(34_000), is86: false },

  { id: 'margherita', name: 'Margherita', category: 'pizza', price: som(68_000), is86: false },
  { id: 'pepperoni', name: 'Pepperoni', category: 'pizza', price: som(78_000), is86: false },
  { id: 'fourcheese', name: 'Four cheese', category: 'pizza', price: som(82_000), is86: false },

  { id: 'caesar', name: 'Caesar', category: 'salads', price: som(38_000), is86: false },
  { id: 'achichuk', name: 'Achichuk', category: 'salads', price: som(14_000), is86: false },
  { id: 'greek', name: 'Greek', category: 'salads', price: som(36_000), is86: false },

  { id: 'ayron', name: 'Ayron', category: 'drinks', price: som(9_000), is86: false },
  { id: 'cola', name: 'Coca-Cola 0.5', category: 'drinks', price: som(12_000), is86: false },
  { id: 'tea', name: 'Green tea', category: 'drinks', price: som(8_000), is86: false },
];

/**
 * The floor comes from the Tables module, not from a list of its own.
 *
 * A waiter picking a table on the tablet and a host reading the floor plan in
 * the console are looking at the same room; two lists would be two rooms that
 * drift apart by one shift. `TABLES` is re-exported so this module stays the
 * POS's single seam even though the data belongs to Tables.
 */
export { TABLE_STATUS, type Table as PosTable } from '../../(dashboard)/tables/tables-data';

/**
 * The bill, computed the way the till computes it.
 *
 * Integer tiyin end to end, and the VAT line is derived *out of* the total
 * rather than added to it — Uzbek prices are quoted inclusive, so showing VAT
 * as an addition would overstate every bill by twelve per cent.
 */
export function billTotals(subtotal: number, discounted: boolean) {
  const service = Math.round(subtotal * 0.1);
  const discount = discounted ? -Math.round(subtotal * 0.1) : 0;
  const total = subtotal + service + discount;

  return { subtotal, service, discount, total, vat: Math.round((total * 12) / 112) };
}

export type PosBoard = { menu: readonly MenuItem[]; tables: readonly Table[] };

/**
 * TODO(api): GET /api/v1/pos/board — the menu with `is86` resolved and the
 * tables this waiter holds. After the first paint the screen listens on
 * `stoplist.*` and `table.*`; the stop list in particular must arrive as a
 * broadcast, never a refetch.
 */
export async function getPosBoard(): Promise<PosBoard> {
  return { menu: MENU, tables: TABLES };
}
