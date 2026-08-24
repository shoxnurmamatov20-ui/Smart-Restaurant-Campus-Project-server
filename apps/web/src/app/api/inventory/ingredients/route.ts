import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A new raw good on the shelf.
 *
 * The store screen's "new item" drawer, which collected nine fields and posted
 * none of them until `2026_08_22_110000` gave four of them a column. What it
 * asks for and what the API stores are not the same shape, and the difference
 * is this file's whole job: the drawer thinks in kilograms because that is how
 * a storekeeper counts, and the API holds grams because a gram is a whole
 * number and 4.237 kg is not.
 */
type Body = {
  sku?: unknown;
  name?: unknown;
  /** `g` | `ml` | `pcs` — what the balance is counted in. */
  base?: unknown;
  /** What it is bought in: `kg`, `l`, `pcs`, `case`, `sack`, `tray`, `box`. */
  purchaseUnit?: unknown;
  /** Base units in one purchase unit. */
  factor?: unknown;
  /** Tiyin per one PURCHASE unit — what the drawer's price field means. */
  price?: unknown;
  /** The reorder point, in purchase units. */
  minimum?: unknown;
  shelfLife?: unknown;
  store?: unknown;
  barcode?: unknown;
};

const BASE_UNITS = new Set(['g', 'ml', 'pcs']);

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const base = typeof body.base === 'string' ? body.base : 'g';
  const factor = whole(body.factor) ?? 1;
  const price = typeof body.price === 'number' && body.price >= 0 ? Math.round(body.price) : null;

  if (name.length < 3) return badRequest('invalid_name');
  if (!BASE_UNITS.has(base)) return badRequest('invalid_unit');
  if (price === null) return badRequest('invalid_price');

  /*
   * The price comes down as tiyin per purchase unit and the column is tiyin
   * per base unit, so it is divided here — once, and with the same divisor the
   * row will be read back through. Rounding down rather than to nearest: a
   * fraction of a tiyin per gram multiplied across a hundred kilos is a stock
   * valuation that reads higher than anything was ever bought for.
   */
  const costPerUnit = Math.floor(price / factor);

  return forward(request, '/inventory/ingredients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // A code the storekeeper did not have to invent. The API refuses a
      // duplicate, which is the answer the drawer shows.
      sku: typeof body.sku === 'string' && body.sku !== '' ? body.sku : autoSku(name),
      name,
      unit: base,
      purchase_unit: typeof body.purchaseUnit === 'string' ? body.purchaseUnit : base,
      units_per_purchase: factor,
      cost_per_unit: costPerUnit,
      min_quantity: (whole(body.minimum) ?? 0) * factor,
      shelf_life_days: whole(body.shelfLife),
      store: typeof body.store === 'string' ? body.store : 'main',
      barcode: typeof body.barcode === 'string' && body.barcode !== '' ? body.barcode : null,
    }),
  });
}

/**
 * A stock code from the name, when nobody typed one.
 *
 * Latin letters and digits, upper-cased, first eight — enough to be recognisable
 * on a printed count sheet and short enough to fit the column. The timestamp
 * suffix is what makes it unique; a name-only code would collide the second
 * time somebody added "Tuz".
 */
function autoSku(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);

  return `${letters === '' ? 'ING' : letters}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}
