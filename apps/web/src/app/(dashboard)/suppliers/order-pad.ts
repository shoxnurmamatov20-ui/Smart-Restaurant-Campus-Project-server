import type { StockRow } from '../inventory/inventory-data';
import { ORDER_CATALOGUE, ORDER_SUPPLIERS, say, type Lang } from './suppliers-data';

/**
 * The order pad — what the "new order" tab is allowed to put on a document.
 *
 * The tab used to run entirely on `ORDER_SUPPLIERS` and `ORDER_CATALOGUE`: four
 * supplier names and a price list typed into the design file, keyed `gosht`,
 * `sabzavot`. Pressing Send flashed `XB-0185 yuborildi` — the same invented
 * document number every time — and posted nothing, so a buyer believed an order
 * had gone to a company this restaurant does not deal with.
 *
 * Both halves exist on the API and neither needed a new endpoint: suppliers are
 * `GET /v1/suppliers/suppliers` and the things to order are the shelf itself,
 * `GET /v1/inventory/ingredients`. What the platform genuinely does not hold is
 * a *price list per supplier* — no table says which company sells which
 * ingredient at what price — so the pad offers the whole shelf against whoever
 * is chosen, priced at what the shelf cost last time, which is the same figure
 * the store screen's per-row order button already sends.
 *
 * The shapes below are what both halves resolve to, so the panel renders one
 * thing and the demo console keeps working unchanged.
 */

export type PadSupplier = {
  /** Stable key for React and for the chip's selected state. */
  id: string;
  /** The row id an order is raised against, or null for a fixture supplier. */
  supplierId: number | null;
  name: string;
  contact: string;
  /** Days from sending to delivery. */
  lead: number;
  /** Already in the reader's language. */
  terms: string;
};

export type PadLine = {
  id: string;
  /** The shelf row this line raises, or null for a fixture line. */
  ingredientId: number | null;
  name: string;
  /** The word the quantity is counted in — kg, dona, case. */
  unit: string;
  /** Purchase units on the shelf now. */
  have: number;
  /** Purchase units the shelf is meant to hold. */
  need: number;
  /**
   * Average daily consumption, or null when nothing measures it.
   *
   * The design's row prints "1.3 days of cover"; that figure needs a usage
   * history the ingredients endpoint does not carry. Null rather than a guess:
   * a days-of-cover number a buyer plans a week around must not be invented,
   * and the row prints the par level instead.
   */
  daily: number | null;
  /** The supplier will not split this. */
  pack: number;
  /** Tiyin, per purchase unit. */
  price: number;
  /** Base units in one purchase unit — the document is written in base units. */
  factor: number;
  baseUnit: string | null;
  /** Tiyin per base unit, which is what the purchase order line carries. */
  priceBase: number;
};

export type OrderPad = {
  suppliers: readonly PadSupplier[];
  lines: readonly PadLine[];
  /**
   * Whether this pad can raise a real document.
   *
   * False is the fixture console — no session, or a reader without
   * `suppliers.view` — and it is what keeps the panel from posting fixture
   * keys at the API.
   */
  live: boolean;
};

/** `GET /v1/suppliers/suppliers`, the columns the pad's chips and card read. */
export type ApiPadSupplier = {
  id: number;
  name: string;
  phone: string | null;
  contact_name: string | null;
  email: string | null;
  lead_time_days: number;
  payment_terms_days: number | null;
  is_active: boolean;
};

/** How the pad words a payment term, from the number of days on the row. */
export function termsOf(days: number | null, copy: { cash: string; net: string }): string {
  return days === null || days <= 0 ? copy.cash : copy.net.replace('{n}', String(days));
}

/**
 * The live pad: real suppliers, and the shelf as the catalogue.
 *
 * `stock` is `getStockBoard()`'s rows, so every unit conversion — grams shown
 * as kilograms, a case of twenty-four — has already happened once, in the one
 * file that knows how. Duplicating it here is how the store screen and the
 * order pad would come to disagree about what a kilo is.
 *
 * The shelf is ordered by how short it is: the lines a buyer is on this tab
 * for are the ones under par, and a pad that opened on an alphabet asks them
 * to find those themselves.
 */
export function padFrom(
  suppliers: readonly ApiPadSupplier[],
  stock: readonly StockRow[],
  unitWord: (row: StockRow) => string,
  terms: { cash: string; net: string },
): OrderPad {
  return {
    live: true,
    suppliers: suppliers
      .filter((supplier) => supplier.is_active)
      .map((supplier) => ({
        id: String(supplier.id),
        supplierId: supplier.id,
        name: supplier.name,
        // The phone is what a buyer reads out loud; the name and the address
        // follow only when there is no number to ring.
        contact: supplier.phone ?? supplier.contact_name ?? supplier.email ?? '—',
        lead: Math.max(0, supplier.lead_time_days),
        terms: termsOf(supplier.payment_terms_days, terms),
      })),
    lines: [...stock]
      .sort((a, b) => shortfall(b) - shortfall(a))
      .map((row) => ({
        id: row.id,
        // Every row on this list is an ingredient the API answered with, so the
        // id is real — `apiId()` on the client is the belt for the fixture case.
        ingredientId: /^\d+$/.test(row.id) ? Number(row.id) : null,
        name: row.name,
        unit: unitWord(row),
        have: row.onHand,
        // A fifth above par, the same sizing the store screen's order button
        // uses. Ordering exactly to par means ordering again the same week.
        need: Math.ceil(row.par * 1.2),
        daily: null,
        // Nothing on the shelf records a supplier's pack size, and inventing
        // one would round every order up to a number the buyer did not choose.
        // One means the +/- buttons step by a single unit.
        pack: 1,
        price: row.price,
        factor: row.factor,
        baseUnit: row.baseUnit,
        priceBase: Math.round(row.price / Math.max(1, row.factor)),
      })),
  };
}

/** How far under par a row is, in purchase units; zero when it is stocked. */
function shortfall(row: StockRow): number {
  return Math.max(0, row.par - row.onHand);
}

/**
 * The demo pad — the design's four suppliers and its price list.
 *
 * Kept, and kept honest: every line carries `ingredientId: null` and every
 * supplier `supplierId: null`, which is what stops the panel from posting.
 */
export function fixturePad(lang: Lang): OrderPad {
  return {
    live: false,
    suppliers: ORDER_SUPPLIERS.map((supplier) => ({
      id: supplier.id,
      supplierId: null,
      name: supplier.name,
      contact: supplier.contact,
      lead: supplier.lead,
      terms: say(supplier.terms, lang),
    })),
    lines: Object.entries(ORDER_CATALOGUE).flatMap(([supplierId, lines]) =>
      lines.map((line) => ({
        id: `${supplierId}:${line.id}`,
        ingredientId: null,
        name: say(line.name, lang),
        unit: say(line.unit, lang),
        have: line.have,
        need: line.need,
        daily: line.daily,
        pack: line.pack,
        price: line.price,
        factor: 1,
        baseUnit: null,
        priceBase: line.price,
      })),
    ),
  };
}

/**
 * Which of the demo lines belong to a demo supplier.
 *
 * The fixture keys its catalogue by supplier and the live pad cannot — no table
 * says who sells what — so the panel asks this rather than branching on `live`
 * in three places.
 */
export function linesFor(pad: OrderPad, supplierId: string): readonly PadLine[] {
  return pad.live ? pad.lines : pad.lines.filter((line) => line.id.startsWith(`${supplierId}:`));
}

/**
 * What the pad proposes for a line: the gap, rounded up to whole packs.
 *
 * The pack is clamped on BOTH sides of the arithmetic. Clamping only the
 * divisor and then multiplying by the raw value answers zero for a pack of
 * zero — a line the buyer would have to notice was missing rather than wrong.
 */
export function suggestedFor(line: PadLine): number {
  const pack = Math.max(1, line.pack);

  return Math.ceil(Math.max(0, line.need - line.have) / pack) * pack;
}
