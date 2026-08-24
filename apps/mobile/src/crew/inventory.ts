import { get } from '@/lib/api';
import { KEYS } from '@/lib/storage';

import { enrolment } from './session';

/**
 * What is behind a barcode, asked of the restaurant's own store.
 *
 * `GET /api/v1/inventory/items?barcode=…` — a plain query parameter and not
 * `filter[barcode]`, which is worth stating because the neighbouring route
 * (`inventory/ingredients`) is a Spatie query builder and *does* take the
 * bracket form. Two shapes for the same idea, and only one of them is this one.
 *
 * **It answers a list and never a 404.** An unregistered code comes back as
 * `{"data": []}`, which is the right shape for a lookup: "no such code" is an
 * ordinary answer a storekeeper acts on, not an exception. A missing barcode
 * parameter answers an empty list too, so a blank scan cannot accidentally
 * return the first twenty-five things on the shelf.
 *
 * The route sits behind `auth:sanctum` + `tenant` and asks for
 * `inventory.view`. `X-Branch` is deliberately not sent: an ingredient carries
 * no branch — stock in this platform is held per restaurant — so a branch
 * header here would narrow nothing and imply a scope that does not exist.
 */

/** One row of `GET inventory/items`, narrowed to what the scanner draws. */
export type ApiIngredient = {
  id: number;
  sku: string;
  barcode: string | null;
  /**
   * A plain string, not a jsonb `{uz,ru,en}` map.
   *
   * Unusual on this platform and checked rather than assumed: `ingredients.name`
   * is `string(160)` and the model does not use `HasTranslations`. A storekeeper
   * types what is on the invoice, and invoices arrive in one language.
   */
  name: string;
  /** The base unit stock is held in: `g`, `ml` or `pcs`. */
  unit: string;
  /** What it is bought by — `kg`, `l`, `case`, `sack`. Equal to `unit` when nothing bigger. */
  purchase_unit: string;
  /** How many base units are in one purchase unit. At least 1. */
  factor: number;
  /** On hand, in base units. */
  stock_quantity: number;
  min_quantity: number;
  is_low: boolean;
};

export type Ingredient = {
  id: number;
  sku: string;
  name: string;
  /** `g` · `ml` · `pcs`. */
  unit: string;
  purchaseUnit: string;
  factor: number;
  onHand: number;
  minimum: number;
  low: boolean;
};

export const ingredientFrom = (row: ApiIngredient): Ingredient => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  unit: row.unit,
  // Guarded rather than trusted: `factor` is a divisor and a multiplier below,
  // and a zero arriving from anywhere would turn every count into zero or NaN.
  purchaseUnit: row.purchase_unit === '' ? row.unit : row.purchase_unit,
  factor: row.factor >= 1 ? row.factor : 1,
  onHand: row.stock_quantity,
  minimum: row.min_quantity,
  low: row.is_low,
});

/** The staff session's bearer and the tenant this phone was paired to. */
async function scope() {
  const phone = await enrolment();

  return { bearer: KEYS.crewSession, tenant: phone?.tenant ?? null } as const;
}

/**
 * The item a code names, or null when the store has never registered it.
 *
 * Throws on anything else — no network, a refused permission, a restarting API
 * — because those are three different things for a person standing in a
 * stockroom to do, and `lib/api.ts` keeps them apart in `Failure`. Flattening
 * them into `null` would tell a storekeeper their delivery is unknown stock
 * when the truth is that the Wi-Fi does not reach the walk-in.
 */
export async function itemForBarcode(barcode: string): Promise<Ingredient | null> {
  const answer = await get<{ data: readonly ApiIngredient[] }>(
    `/inventory/items?barcode=${encodeURIComponent(barcode)}`,
    await scope(),
  );

  const first = answer.data[0];

  return first === undefined ? null : ingredientFrom(first);
}

/**
 * How many base units a typed quantity is.
 *
 * A storekeeper counts in what is written on the box — kilos, cases, litres —
 * and the ledger holds grams, pieces and millilitres. The multiplication is one
 * line and it is the single most dangerous line on the screen: get it inverted
 * and a shelf of five kilos is recorded as five grams, which posts a write-off
 * of the entire stock. It is therefore in one place, tested, and the screen
 * prints its result back to the person before they can save it.
 *
 * Returns null for anything that is not a number — an empty field, a stray
 * comma, a minus sign. `counted` is validated `integer|min:0` on the server and
 * a negative count is not a small quantity, it is a typo.
 */
export function baseUnits(typed: string, factor: number): number | null {
  const cleaned = typed.replace(',', '.').trim();

  if (cleaned === '') return null;

  const value = Number(cleaned);

  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * factor);
}

/** `4750` grams with a factor of 1000 → `4.75`. The inverse, for display. */
export const inPurchaseUnits = (base: number, factor: number): number =>
  factor === 1 ? base : Math.round((base / factor) * 1000) / 1000;
