import { apiGet, type Paginated } from '@/lib/api-server';

import { writtenAt, writtenClock } from '@restaurant/surfaces/time/written';
import {
  isStoreId,
  levelOf,
  STOCK,
  STOCK_SUMMARY,
  type BaseUnit,
  type StockRow,
  type StoreId,
  type Unit,
} from './inventory-data';

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
  /** The base unit every quantity on the row is counted in: `g`, `ml`, `pcs`. */
  unit: string;
  /** What a storekeeper counts and a supplier sells in: `kg`, `case`, `sack`. */
  purchase_unit: string;
  /** Base units in one purchase unit: 1000 g in a kg, 24 bottles in a case. */
  factor: number;
  /** Base units — grams, millilitres, pieces. Never a fraction. */
  stock_quantity: number;
  min_quantity: number;
  /** Tiyin per one base unit. */
  cost_per_unit: number;
  /** Which shelf inside the venue: `main`, `kitchen`, `bar`. */
  store: string;
  shelf_life_days: number | null;
  is_active: boolean;
};

/** `GET /api/v1/inventory/movements` — the ledger under the balance. */
type ApiMovement = {
  ingredient_id: number;
  kind: string;
  /** Signed: positive in, negative out. Base units. */
  quantity: number;
  happened_at: string | null;
};

/** `GET /api/v1/suppliers/purchase-orders?include=supplier,items`. */
type ApiPurchaseOrder = {
  status: string;
  expected_at: string | null;
  received_at: string | null;
  supplier?: { id: number; name: string } | null;
  items?: readonly { ingredient_id: number | null }[] | null;
};

/** Who brings an ingredient: the name a person reads, and the id an order needs. */
type Source = { id: string; name: string };

/**
 * The API's base unit against the three the screen shows, with the divisor
 * that turns one into the other.
 *
 * Stock is held in the smallest unit there is — grams, not kilograms — because
 * a gram is a whole number and 4.2 kg is not. The screen shows kilograms
 * because that is how a storekeeper counts, so the conversion happens here and
 * the fixtures, which were written in kilograms already, are untouched.
 */
const UNITS: Readonly<Record<string, { unit: Unit; per: number; base: BaseUnit | null }>> = {
  g: { unit: 'unitKg', per: 1000, base: 'g' },
  kg: { unit: 'unitKg', per: 1, base: null },
  ml: { unit: 'unitL', per: 1000, base: 'ml' },
  l: { unit: 'unitL', per: 1, base: null },
  pcs: { unit: 'unitPcs', per: 1, base: null },
  pc: { unit: 'unitPcs', per: 1, base: null },
};

/**
 * How a row is denominated, from what the API says it is bought in.
 *
 * The column has to mean one thing, and which thing depends on the product. A
 * case of twenty-four bottles is counted in cases — the design writes the cola
 * line that way and it is right to, because that is how the fridge is filled.
 * A sack of flour is not: a storekeeper buys sacks and counts kilograms, and a
 * shelf reading "1.9 sacks" is a number nobody can check against a shelf.
 *
 * So a purchase unit the console has a word for wins, and everything else falls
 * back to the base unit's natural pair — grams shown as kilograms, millilitres
 * as litres, pieces as pieces. That fallback is the rule this file used for
 * every row before the API could say more.
 */
function denominate(item: ApiIngredient): { unit: Unit; per: number; base: BaseUnit | null } {
  const fallback = UNITS[item.unit] ?? { unit: 'unitPcs' as Unit, per: 1, base: null };

  // The one purchase unit that is not arithmetic on the base unit, and the one
  // the catalogue has a word for outside its own three.
  if (item.purchase_unit === 'case' && item.factor > 1) {
    return { unit: 'unitCase', per: item.factor, base: baseOf(item.unit) };
  }

  const named = UNITS[item.purchase_unit];

  // `kg` against a base of `g` gives a divisor of a thousand; `kg` against a
  // base of `kg` gives one. Taking the divisor from the *base* unit rather than
  // from the purchase unit is what keeps those two apart.
  return named === undefined
    ? fallback
    : { unit: named.unit, per: fallback.per, base: fallback.base };
}

/** The three the recipe card is written in; anything else has no second unit. */
function baseOf(unit: string): BaseUnit | null {
  return unit === 'g' || unit === 'ml' || unit === 'pcs' ? unit : null;
}

/** A purchase order that has not been received and has not been called off. */
const OPEN_STATUSES = new Set(['draft', 'sent', 'confirmed']);

/**
 * What one render of this screen needs: the rows, and the four figures above
 * them.
 *
 * The figures are derived from the same rows the table draws rather than read
 * from `GET /inventory/` — which offers its own counts, and counts "below par"
 * as at-or-under the reorder point while this screen's pill calls anything
 * under half of par low. Two definitions on one screen is how a strip comes to
 * disagree with the table directly beneath it.
 *
 * Every shelf is fetched, never one. `GET /inventory/ingredients` takes
 * `filter[store]` and the crew app's store panel uses it — but this screen's
 * chips carry a per-shelf count and a low-stock dot, and the four figures above
 * them deliberately do not follow the chip. Filtering here would leave both
 * reading whichever shelf happened to be selected.
 */
export type StockBoard = {
  rows: readonly StockRow[];
  summary: {
    valueTiyin: number;
    belowPar: number;
    wasteTodayTiyin: number;
    openPurchases: number;
  };
};

/**
 * The shelf for this render — the API's when there is a session.
 *
 * Three calls, not one per row. The ingredient endpoint carries neither the
 * supplier nor the last movement, and both are joins: the movements answer
 * "what happened to this" and the purchase orders answer "who brings it". Two
 * list requests resolve every row at once; a request per ingredient would be
 * eleven on this page and a hundred on a real one.
 */
export async function getStockBoard(now: Date = new Date()): Promise<StockBoard> {
  const [stock, movements, orders] = await Promise.all([
    apiGet<Paginated<ApiIngredient>>('/inventory/ingredients?per_page=200'),
    apiGet<Paginated<ApiMovement>>('/inventory/movements?per_page=100&sort=-happened_at'),
    apiGet<Paginated<ApiPurchaseOrder>>(
      '/suppliers/purchase-orders?per_page=100&include=supplier,items',
    ),
  ]);

  if (!stock?.data) return { rows: STOCK, summary: STOCK_SUMMARY };

  const latest = latestMovementByIngredient(movements?.data ?? []);
  const sources = supplierByIngredient(orders?.data ?? []);

  const rows = stock.data
    // A delisted ingredient is not on the shelf. Its history stays in the
    // ledger; the storekeeper should not be asked to count it.
    .filter((item) => item.is_active)
    .map((item): StockRow => {
      const { unit, per, base } = denominate(item);
      // One decimal, as the design's column shows it: 4.2 kg, not 4.237.
      const round = (value: number) => Math.round((value / per) * 10) / 10;
      const move = latest.get(item.id);

      return {
        id: String(item.id),
        name: item.name,
        unit,
        baseUnit: base,
        factor: per,
        // `cost_per_unit` is tiyin for one *base* unit, so a kilogram costs it
        // a thousand times over. Multiplied here rather than in the drawer,
        // because the drawer divides it straight back down to show the base
        // price and two roundings of the same figure would drift apart.
        price: item.cost_per_unit * per,
        shelfLife: item.shelf_life_days,
        /*
         * Which shelf. `null` only for a value the console has no chip for —
         * the API's list and this screen's are the same three today, and a
         * fourth appearing there should draw an unfiltered row rather than a
         * chip nobody can press.
         */
        store: storeOf(item.store),
        onHand: round(item.stock_quantity),
        par: round(item.min_quantity),
        // An em dash rather than a guess: an ingredient nobody has ordered yet
        // genuinely has no supplier, and inventing one would be the only line
        // on this screen a storekeeper could not check.
        supplier: sources.get(item.id)?.name ?? '—',
        supplierId: sources.get(item.id)?.id ?? null,
        lastMove:
          move === undefined
            ? null
            : { quantity: round(move.quantity), at: timeIfToday(move.happened_at, now) },
      };
    });

  return {
    rows,
    summary: {
      // Summed from the same rows, in tiyin. `stock_value` is offered by the
      // resource too, but it is the API's rounding of the API's quantity, and
      // this figure has to agree with the column beside it.
      valueTiyin: stock.data
        .filter((item) => item.is_active)
        .reduce((total, item) => total + Math.max(0, item.stock_quantity) * item.cost_per_unit, 0),
      belowPar: rows.filter((row) => levelOf(row) !== 'healthy').length,
      wasteTodayTiyin: wasteToday(movements?.data ?? [], stock.data, now),
      openPurchases: (orders?.data ?? []).filter((order) => OPEN_STATUSES.has(order.status)).length,
    },
  };
}

/** One of the three chips, or nothing when the API names a fourth shelf. */
function storeOf(value: string): StoreId | null {
  return isStoreId(value) ? value : null;
}

/**
 * The most recent movement per ingredient.
 *
 * The endpoint answers newest-first, so the first row seen for an ingredient is
 * its last movement. Stated rather than assumed: the sort is asked for in the
 * query above, because a default that changed would otherwise turn this into a
 * column of random history with no visible failure.
 */
function latestMovementByIngredient(movements: readonly ApiMovement[]): Map<number, ApiMovement> {
  const latest = new Map<number, ApiMovement>();

  for (const movement of movements) {
    if (!latest.has(movement.ingredient_id)) latest.set(movement.ingredient_id, movement);
  }

  return latest;
}

/**
 * Who brings each ingredient, from the orders that were actually placed.
 *
 * Walked oldest first so the newest order wins: a kitchen that switched butcher
 * last week should see the butcher it uses now, not the one it left.
 */
function supplierByIngredient(orders: readonly ApiPurchaseOrder[]): Map<number, Source> {
  const byIngredient = new Map<number, Source>();

  const dated = [...orders].sort((a, b) => stampOf(a) - stampOf(b));

  for (const order of dated) {
    const supplier = order.supplier;

    if (supplier === undefined || supplier === null) continue;

    for (const item of order.items ?? []) {
      if (item.ingredient_id !== null) {
        byIngredient.set(item.ingredient_id, { id: String(supplier.id), name: supplier.name });
      }
    }
  }

  return byIngredient;
}

/** When an order happened, for ordering purposes; unplaced sorts first. */
function stampOf(order: ApiPurchaseOrder): number {
  const stamp = order.received_at ?? order.expected_at;

  if (stamp === null || stamp === undefined) return 0;

  const at = Date.parse(stamp);

  return Number.isNaN(at) ? 0 : at;
}

/**
 * What today's write-offs cost, in tiyin.
 *
 * The calendar day, not the trading one. The API counts write-offs against the
 * venue's business day and this cannot see where that boundary falls, so the
 * two can disagree for a write-off logged after midnight — the direction of the
 * error is a figure that is too small for an hour, which is the safe way round
 * for a number nobody acts on until morning.
 *
 * The clock comes from the caller so that one render answers "today" once. Read
 * here and again per row, a page drawn across midnight would price the day's
 * waste against one date and time the rows against the next.
 */
function wasteToday(
  movements: readonly ApiMovement[],
  ingredients: readonly ApiIngredient[],
  now: Date,
): number {
  const cost = new Map(ingredients.map((item) => [item.id, item.cost_per_unit]));
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  return movements
    .filter((movement) => movement.kind === 'write_off' && isAfter(movement.happened_at, midnight))
    .reduce(
      (total, movement) =>
        total + Math.abs(movement.quantity) * (cost.get(movement.ingredient_id) ?? 0),
      0,
    );
}

function isAfter(stamp: string | null, from: Date): boolean {
  if (stamp === null) return false;

  const at = Date.parse(stamp);

  return !Number.isNaN(at) && at >= from.getTime();
}

/**
 * `HH:MM` for something that happened today, and nothing for anything older.
 *
 * The hour is the one the venue wrote. `happened_at` carries the venue's own
 * offset — `2026-08-28T08:20:00+05:00` is twenty past eight on that shelf — and
 * `new Date(stamp).getHours()` re-expressed it in whichever zone the console
 * runs in, so a write-off counted at 08:20 in the kitchen printed 03:20 on a box
 * set to UTC, beside a quantity that was right. That pairing is the damage: a
 * figure a storekeeper can check against an hour they cannot.
 *
 * The day is read from the written fields for the same reason, and that half
 * costs the whole label rather than mistyping it. Converted, a movement logged
 * at 01:10 lands on the previous date, fails the same-day check and shows no
 * time at all — so the freshest line on the shelf becomes the one that reads
 * "at some point", which is the thing this column exists to rule out.
 *
 * `now` stays in the reader's own zone, because it is the reader asking whether
 * this happened today; on the console standing in the venue the two frames are
 * one frame anyway.
 */
function timeIfToday(stamp: string | null, now: Date): string | null {
  if (stamp === null) return null;

  const at = writtenAt(stamp);

  if (at === null) return null;

  const sameDay =
    at.getUTCFullYear() === now.getFullYear() &&
    at.getUTCMonth() === now.getMonth() &&
    at.getUTCDate() === now.getDate();

  if (!sameDay) return null;

  return writtenClock(stamp);
}

/* ============================================================
   The line under the title
   ============================================================ */

/**
 * When this shelf was last counted, or null when it never has been.
 *
 * `console.inventory.subtitle` read "Chilonzor ombori · bugun 07:30 da Sardor
 * N. sanagan" on every console — a named person, a named warehouse and a time,
 * asserted for restaurants where nobody had ever counted anything. That is a
 * control statement, and the only honest version of it comes from the ledger.
 *
 * One row is enough: the newest `stock_take` movement is the count. The person
 * is deliberately not named — `StockMovement` records what moved, not who moved
 * it — so the sentence says when and stops there.
 */
export async function getLastCountAt(): Promise<string | null> {
  const answer = await apiGet<Paginated<ApiMovement>>(
    '/inventory/movements?per_page=1&sort=-happened_at&filter[kind]=stock_take',
  );

  return answer?.data?.[0]?.happened_at ?? null;
}

/** Whether `getStockBoard()` answered from the API rather than the fixture. */
export function stockIsLive(board: StockBoard): boolean {
  return board.rows !== STOCK;
}
