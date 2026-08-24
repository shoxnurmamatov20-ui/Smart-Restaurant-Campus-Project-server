import { scaleFor, type Period } from './overview-data';

/**
 * The storekeeper's stock dashboard.
 *
 * One branch's store, so `getWarehouseOverview()` takes the branch. Quantities
 * are in the item's own unit — kilograms, litres, pieces — and the unit travels
 * with the figure rather than being assumed, because a store holds all three
 * and a number without its unit is a number that will be re-entered wrong.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type StockState = 'ok' | 'low' | 'out' | 'expiring';

export type StockCount = Record<StockState, number>;

export type Delivery = {
  id: string;
  /** A supplier's name is a proper noun; it is not translated. */
  supplier: string;
  items: number;
  time: string;
  status: 'accepted' | 'onWay' | 'late';
};

export type ConsumedItem = {
  id: string;
  /** An ingredient's name is a proper noun; it is not translated. */
  name: string;
  quantity: number;
  unit: 'kg' | 'l' | 'dona';
  /** What it cost over the period, in tiyin. */
  cost: number;
  /** Share of the most-consumed line, 0–1 — the width of the little bar. */
  share: number;
};

export type WarehouseOverview = {
  greetingName: string;
  /** The venue whose store this is, from the session. */
  placeName: string;
  /** False for the design's own store — see `./figures.ts`. */
  live: boolean;
  lowStock: number | null;
  expiring: number | null;
  /**
   * Goods arriving, which is a Suppliers receipt and not on this payload. Null
   * on a live tenant, and the table below draws its empty state — four
   * scheduled deliveries from suppliers a restaurant has never dealt with is
   * the version of this panel that shipped.
   */
  deliveriesToday: number | null;
  deliveriesAccepted: number | null;
  /** Waste as a percentage of stock value, one decimal. Null on an empty shelf. */
  wastePercent: number | null;
  stock: StockCount | null;
  incoming: readonly Delivery[];
  consumed: readonly ConsumedItem[];
};

const PLACEHOLDER = {
  greetingName: 'Sardor',
  placeName: 'Chilonzor',
  live: false,
  lowStock: 4,
  expiring: 2,
  deliveriesToday: 3,
  deliveriesAccepted: 2,
  wastePercent: 1.8,

  stock: { ok: 128, low: 4, out: 2, expiring: 8 },

  incoming: [
    { id: 'dl-1', supplier: 'Anhor Meat', items: 6, time: '09:20', status: 'accepted' },
    { id: 'dl-2', supplier: 'Toshkent Non', items: 3, time: '10:05', status: 'accepted' },
    { id: 'dl-3', supplier: 'Fresh Line', items: 11, time: '14:30', status: 'onWay' },
    { id: 'dl-4', supplier: 'Coca-Cola Ichimlik', items: 4, time: '16:00', status: 'late' },
  ],

  consumed: [
    { id: 'beef', name: "Mol go'shti", quantity: 84, unit: 'kg', cost: som(7_560_000), share: 1 },
    {
      id: 'rice',
      name: 'Devzira guruch',
      quantity: 62,
      unit: 'kg',
      cost: som(1_860_000),
      share: 0.74,
    },
    {
      id: 'flour',
      name: 'Un, oliy navli',
      quantity: 55,
      unit: 'kg',
      cost: som(742_000),
      share: 0.65,
    },
    { id: 'oil', name: 'Paxta moyi', quantity: 38, unit: 'l', cost: som(988_000), share: 0.45 },
    { id: 'onion', name: 'Piyoz', quantity: 31, unit: 'kg', cost: som(217_000), share: 0.37 },
  ],
} satisfies WarehouseOverview;

/**
 * The fixture this screen falls back to. Live seam: `getWarehouseLive()` in
 * `./dashboard-server.ts` — `GET /api/v1/dashboard?role=warehouse`, scoped to a
 * branch by the `X-Branch` header the API client already sends.
 */
export async function getWarehouseOverview(
  branchSlug: string | null = null,
  period: Period = 'today',
): Promise<WarehouseOverview> {
  void branchSlug;

  /*
   * Deliveries and consumption scale; what is on the shelf does not. "128 SKUs
   * in stock" multiplied by twenty-seven is not a number about anything, and
   * neither is a waste *percentage* — it is a ratio.
   */
  const factor = scaleFor(period);

  if (factor === 1) return PLACEHOLDER;

  return {
    ...PLACEHOLDER,
    deliveriesToday: Math.round(PLACEHOLDER.deliveriesToday * factor),
    deliveriesAccepted: Math.round(PLACEHOLDER.deliveriesAccepted * factor),
    consumed: PLACEHOLDER.consumed.map((item) => ({
      ...item,
      quantity: Math.round(item.quantity * factor),
      cost: Math.round(item.cost * factor),
    })),
  };
}
