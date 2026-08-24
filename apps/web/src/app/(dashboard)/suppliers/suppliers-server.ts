import { apiGet, type Paginated } from '@/lib/api-server';

import { STOCK, type StockRow } from '../inventory/inventory-data';
import { getStockBoard } from '../inventory/inventory-server';
import { fixturePad, padFrom, type ApiPadSupplier, type OrderPad } from './order-pad';
import {
  isOpenPurchase,
  purchaseOrderFixture,
  SUPPLIERS,
  type PurchaseOrderRow,
  type Lang,
  type PurchaseStatus,
  type SupplierRow,
} from './suppliers-data';

/**
 * The order book, from the API.
 *
 * Server half of ./suppliers-data.ts — the split every screen follows: types
 * and fixtures in `*-data.ts`, server calls in a sibling only server
 * components import. See tables-server.ts for why.
 *
 * Both halves are live now. The supplier list used to stay on fixtures because
 * four of its seven columns had nothing behind them — the endpoint answered
 * with a code, a phone number and a payment term while the design asked for a
 * category, a lead time, an on-time percentage and a quarter's spend. Two of
 * those are now columns (`2026_08_22_100000`) and three are subqueries the API
 * computes from the orders themselves, which is why they cannot go stale.
 */

/** `GET /api/v1/suppliers/purchase-orders?include=supplier,items`. */
type ApiPurchaseOrder = {
  id: number;
  number: string;
  status: string;
  expected_at: string | null;
  received_at: string | null;
  total: number;
  supplier?: { id: number; name: string } | null;
  items?: readonly unknown[] | null;
};

/** The five states the model defines; anything else is not drawn. */
const STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'sent',
  'confirmed',
  'received',
  'cancelled',
]);

/**
 * The book for this render, ordered the way a buyer reads it.
 *
 * What is still to come first, soonest at the top — that is the working list,
 * and the overdue rows rise to the top of it by themselves. Everything settled
 * follows in reverse, most recent first, which is the order you want when you
 * are looking something up rather than acting on it.
 */
export async function getPurchaseOrders(): Promise<readonly PurchaseOrderRow[]> {
  const orders = await apiGet<Paginated<ApiPurchaseOrder>>(
    '/suppliers/purchase-orders?per_page=100&include=supplier,items',
  );

  if (!orders?.data) return sortForBuyer(purchaseOrderFixture());

  const rows = orders.data
    .filter((order) => STATUSES.has(order.status))
    .map((order): PurchaseOrderRow => ({
      id: String(order.id),
      number: order.number,
      // An order always has a supplier — the column is not nullable — but the
      // relation is only loaded when asked for, and a screen that printed
      // "undefined" because an include was dropped would be worse than one
      // that admits it does not know.
      supplier: order.supplier?.name ?? '—',
      expected: isoDate(order.expected_at),
      lines: order.items?.length ?? 0,
      status: order.status as PurchaseStatus,
      total: order.total,
    }));

  return sortForBuyer(rows);
}

function sortForBuyer(rows: readonly PurchaseOrderRow[]): readonly PurchaseOrderRow[] {
  const open = rows.filter(isOpenPurchase).sort((a, b) => stamp(a) - stamp(b));
  const settled = rows.filter((row) => !isOpenPurchase(row)).sort((a, b) => stamp(b) - stamp(a));

  return [...open, ...settled];
}

/** An order with no date sorts last among the open ones — nothing is due. */
function stamp(row: PurchaseOrderRow): number {
  return row.expected === null ? Number.MAX_SAFE_INTEGER : Date.parse(row.expected);
}

/** The date half of an ISO timestamp; the hour a van is booked for is not news. */
function isoDate(stampedAt: string | null): string | null {
  if (stampedAt === null) return null;

  const at = Date.parse(stampedAt);

  return Number.isNaN(at) ? null : stampedAt.slice(0, 10);
}

/* ------------------------------------------------------------- suppliers */

/** `GET /api/v1/suppliers/suppliers`, narrowed to what this screen draws. */
type ApiSupplier = {
  id: number;
  name: string;
  category: string;
  phone: string | null;
  contact_name: string | null;
  lead_time_days: number;
  /** Null until something has actually arrived from them. */
  on_time_percent?: number | null;
  open_purchase_orders?: number;
  /** Tiyin, over the last quarter. */
  quarter_spend?: number;
  is_active: boolean;
};

/**
 * The API's category against the message key the column reads.
 *
 * A map rather than string arithmetic (`'cat' + capitalise(value)`): the
 * catalogue keys are typed, and building one at runtime would compile happily
 * and print `cat.catPoultry` the first time somebody added a category the
 * console had no word for.
 */
const CATEGORY: Readonly<Record<string, SupplierRow['category']>> = {
  meat: 'catMeat',
  poultry: 'catPoultry',
  dairy: 'catDairy',
  produce: 'catProduce',
  dry: 'catDry',
  beverages: 'catBeverages',
};

/**
 * Days against the four phrases the design's column uses.
 *
 * Anything past three days is drawn as three: the column is a promise a buyer
 * plans around, and "in a week" and "in three days" are the same instruction —
 * order it now.
 */
function leadFrom(days: number): SupplierRow['lead'] {
  if (days <= 0) return 'leadSameDay';
  if (days === 1) return 'leadNextDay';
  if (days === 2) return 'leadTwoDays';

  return 'leadThreeDays';
}

/**
 * Who the restaurant buys from, for this render.
 *
 * Delisted suppliers are left out: a company nobody orders from any more is
 * history, and it belongs in the order book rather than at the top of the
 * screen where a buyer picks somebody to phone.
 */
export async function getSuppliers(): Promise<readonly SupplierRow[]> {
  const suppliers = await apiGet<Paginated<ApiSupplier>>('/suppliers/suppliers?per_page=100');

  if (!suppliers?.data) return SUPPLIERS;

  return suppliers.data
    .filter((supplier) => supplier.is_active)
    .map((supplier): SupplierRow => ({
      id: String(supplier.id),
      name: supplier.name,
      // A category the console has no word for falls back to the one it does
      // — an em dash in a filter column is worse than an honest "other".
      category: CATEGORY[supplier.category] ?? 'catDry',
      lead: leadFrom(supplier.lead_time_days),
      onTime: supplier.on_time_percent ?? null,
      openPurchases: supplier.open_purchase_orders ?? 0,
      // The phone number is what the column is for: this is the cell a buyer
      // reads out loud. The contact name follows it when there is one.
      contact: supplier.phone ?? supplier.contact_name ?? '—',
      spend: supplier.quarter_spend ?? 0,
    }));
}

/* ============================================================
   The order pad, and the line under the title
   ============================================================ */

/**
 * The "new order" tab's suppliers and its catalogue.
 *
 * See ./order-pad.ts for why the catalogue is the shelf rather than a price
 * list: no table in this platform says which company sells which ingredient.
 *
 * The suppliers read is deliberately the same URL `getSuppliers()` above asks
 * for and not a shared result — the two want different columns, and one of them
 * is on a tab most readers never open. Next's fetch cache resolves the
 * duplicate inside a single render.
 */
export async function getOrderPad(
  unitWord: (row: StockRow) => string,
  terms: { cash: string; net: string },
  lang: Lang,
): Promise<OrderPad> {
  const [suppliers, board] = await Promise.all([
    apiGet<Paginated<ApiPadSupplier>>('/suppliers/suppliers?per_page=100'),
    getStockBoard(),
  ]);

  // Both halves have to be real. A pad with live suppliers and a fixture shelf
  // would raise an order for `g1` — a key no ingredient has — and a pad with a
  // live shelf and fixture suppliers would raise it against nobody.
  if (!suppliers?.data || board.rows === STOCK) return fixturePad(lang);

  return padFrom(suppliers.data, board.rows, unitWord, terms);
}

/**
 * What the line under the title can honestly say.
 *
 * `console.suppliers.subtitle` is the design's mock — "6 ta faol · 8 ta ochiq
 * xarid · bu chorakda 117M so'm" — and a tenant with no suppliers at all read
 * it above its own correct empty state.
 *
 * `null` means the tables are fixtures, and the design's own sentence is the
 * honest caption for the design's own data.
 */
export type SupplierFacts = { active: number; open: number; spend: number } | null;

export function supplierFacts(
  suppliers: readonly SupplierRow[],
  orders: readonly PurchaseOrderRow[],
  live: boolean,
): SupplierFacts {
  if (!live) return null;

  return {
    active: suppliers.length,
    open: orders.filter(isOpenPurchase).length,
    // Tiyin. The quarter's spend is the API's own per-supplier subquery summed,
    // rather than a total over the order book: the book on screen is one page
    // and includes drafts nobody has sent.
    spend: suppliers.reduce((total, supplier) => total + supplier.spend, 0),
  };
}

/** Whether `getSuppliers()` answered from the API rather than the fixture. */
export function suppliersAreLive(rows: readonly SupplierRow[]): boolean {
  return rows !== SUPPLIERS;
}
