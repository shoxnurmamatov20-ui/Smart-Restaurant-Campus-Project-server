import { apiGet, type Paginated } from '@/lib/api-server';

import { STOCK, type StockRow, type Unit } from './inventory-data';

/**
 * The shelf, from the API.
 *
 * Server half of ./inventory-data.ts — the split every screen follows: types
 * and fixtures in `*-data.ts`, server calls in a sibling only server
 * components import. See tables-server.ts for why.
 */

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
