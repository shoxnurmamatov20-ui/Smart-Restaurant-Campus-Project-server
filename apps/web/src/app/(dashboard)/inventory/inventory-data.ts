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

export type Unit = keyof Pick<Messages['console']['inventory'], 'unitKg' | 'unitL' | 'unitPcs'>;

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
