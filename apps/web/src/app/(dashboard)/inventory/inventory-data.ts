import { apiGet, type Paginated } from '@/lib/api-server';

import type { Messages } from '@/i18n';

/**
 * The store room, as the design's screen lists it.
 *
 * Quantities are decimal because ingredients are weighed, not counted — 4.2 kg
 * of beef is a real reading. Money stays integer tiyin.
 *
 * Wired to `GET /api/v1/inventory/ingredients` — see `getStockRows()`. The list
 * below is what the screen draws with no session behind it.
 */

type Unit = keyof Pick<Messages['console']['inventory'], 'unitKg' | 'unitL' | 'unitPcs'>;

export type StockRow = {
  id: string;
  /** An ingredient's name as the storekeeper knows it. */
  name: string;
  unit: Unit;
  onHand: number;
  /** The level below which the kitchen starts running out. */
  par: number;
  supplier: string;
  /** The last movement, as the ledger recorded it. */
  lastMove: string;
};

export const STOCK: readonly StockRow[] = [
  {
    id: 'beef',
    name: 'Mol go‘shti, kurak',
    unit: 'unitKg',
    onHand: 4.2,
    par: 18,
    supplier: "Farg'ona Meat",
    lastMove: '-6.4 kg',
  },
  {
    id: 'lamb',
    name: 'Qo‘y go‘shti, son',
    unit: 'unitKg',
    onHand: 11.5,
    par: 14,
    supplier: "Farg'ona Meat",
    lastMove: '-3.1 kg',
  },
  {
    id: 'rice',
    name: 'Devzira guruch',
    unit: 'unitKg',
    onHand: 11,
    par: 40,
    supplier: 'Osiyo Savdo',
    lastMove: '-9 kg',
  },
  {
    id: 'mozzarella',
    name: 'Mozzarella',
    unit: 'unitKg',
    onHand: 2.8,
    par: 10,
    supplier: 'Milko',
    lastMove: '-2.2 kg',
  },
  {
    id: 'tomato',
    name: 'Pomidor',
    unit: 'unitKg',
    onHand: 26,
    par: 20,
    supplier: 'Chorsu Bozor',
    lastMove: '+30 kg 08:10',
  },
  {
    id: 'onion',
    name: 'Piyoz',
    unit: 'unitKg',
    onHand: 41,
    par: 25,
    supplier: 'Chorsu Bozor',
    lastMove: '-5 kg',
  },
  {
    id: 'flour',
    name: 'Un, oliy nav',
    unit: 'unitKg',
    onHand: 68,
    par: 50,
    supplier: 'Osiyo Savdo',
    lastMove: '-12 kg',
  },
  {
    id: 'cola',
    name: 'Coca-Cola 0.5',
    unit: 'unitPcs',
    onHand: 18,
    par: 96,
    supplier: 'Coca-Cola UZ',
    lastMove: '-42',
  },
  {
    id: 'oil',
    name: 'Paxta yog‘i',
    unit: 'unitL',
    onHand: 34,
    par: 30,
    supplier: 'Osiyo Savdo',
    lastMove: '-4 l',
  },
  {
    id: 'chicken',
    name: 'Tovuq filesi',
    unit: 'unitKg',
    onHand: 19,
    par: 16,
    supplier: 'Parranda Plus',
    lastMove: '+20 kg 07:40',
  },
];

export type StockLevel = 'critical' | 'belowPar' | 'healthy';

/**
 * How worried to be about a line.
 *
 * The design's thresholds: under a third of par is critical, under a half is
 * below par. Both are fractions of the level the kitchen set rather than fixed
 * quantities, because 4 kg of saffron and 4 kg of onion are not the same news.
 */
export function levelOf(row: StockRow): StockLevel {
  const ratio = row.onHand / row.par;

  if (ratio < 0.3) return 'critical';
  if (ratio < 0.5) return 'belowPar';

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
  belowPar: 4,
  wasteTodayTiyin: 18_200_000,
  openPurchases: 8,
} as const;

// ============ The API seam ============

/** `GET /api/v1/inventory/ingredients`, narrowed to what this screen draws. */
type ApiIngredient = {
  id: number;
  name: string;
  unit: string;
  /** Base units — grams, millilitres, pieces. Never a fraction. */
  stock_quantity: number;
  min_quantity: number;
  is_active: boolean;
};

/**
 * The API's base unit against the three the screen shows, with the divisor
 * that turns one into the other.
 *
 * Stock is held in the smallest unit there is — grams, not kilograms — because
 * a gram is a whole number and 4.2 kg is not. The screen shows kilograms
 * because that is how a storekeeper counts, so the conversion happens here and
 * the fixtures, which were written in kilograms already, are untouched.
 */
const UNITS: Readonly<Record<string, { unit: Unit; per: number }>> = {
  g: { unit: 'unitKg', per: 1000 },
  kg: { unit: 'unitKg', per: 1 },
  ml: { unit: 'unitL', per: 1000 },
  l: { unit: 'unitL', per: 1 },
  pcs: { unit: 'unitPcs', per: 1 },
  pc: { unit: 'unitPcs', per: 1 },
};

/** The shelf for this render — the API's when there is a session. */
export async function getStockRows(): Promise<readonly StockRow[]> {
  const stock = await apiGet<Paginated<ApiIngredient>>('/inventory/ingredients?per_page=200');

  if (!stock?.data) return STOCK;

  return (
    stock.data
      // A delisted ingredient is not on the shelf. Its history stays in the
      // ledger; the storekeeper should not be asked to count it.
      .filter((item) => item.is_active)
      .map((item) => {
        const { unit, per } = UNITS[item.unit] ?? { unit: 'unitPcs' as Unit, per: 1 };
        // One decimal, as the design's column shows it: 4.2 kg, not 4.237.
        const round = (value: number) => Math.round((value / per) * 10) / 10;

        return {
          id: String(item.id),
          name: item.name,
          unit,
          onHand: round(item.stock_quantity),
          par: round(item.min_quantity),
          // TODO(api): the ingredient carries no supplier and no last movement.
          // Both exist — `/suppliers/suppliers` and `/inventory/movements` — and
          // both are a join the endpoint should do rather than this screen firing
          // a request per row. Shown as an em dash rather than guessed at.
          supplier: '—',
          lastMove: '—',
        };
      })
  );
}
