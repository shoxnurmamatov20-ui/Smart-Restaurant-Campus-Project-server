import { cookies } from 'next/headers';

import { apiBase } from '@/lib/server-session';

import { CREW_SESSION_COOKIE, CREW_TENANT_COOKIE, enrolledPhone } from './crew-session';
import { CALLS_COPY, copy, fill, TODAY as TODAY_COPY } from '@restaurant/surfaces/crew/copy';
import {
  APPROVALS,
  CALLS,
  COUNT_ITEMS,
  DELIVERIES,
  MENU_ROWS,
  MY_TABLES,
  STOCK,
  TODAY,
  TABLE_LINES,
  ZONES,
  type Call,
  type Lang,
  type MenuRow,
  type MyTable,
  type OrderLine,
  type TodayBoard,
} from '@restaurant/surfaces/crew/data';
import {
  deliveriesFrom,
  floorFrom,
  foundTablesFrom,
  menuFrom,
  queueFrom,
  callsFrom,
  shelfFrom,
  tableLinesFrom,
  todayFrom,
  type ApiApproval,
  type ApiCrewDashboard,
  type ApiHall,
  type ApiIngredient,
  type ApiMenuItem,
  type FoundTable,
  type ApiOrder,
  type ApiOrderItem,
  type ApiPurchaseOrder,
  type ApiTable,
  type ApiWaiterCall,
  type ApprovalQueue,
  type CrewDelivery,
  type ShelfRow,
  type WaiterFloor,
  pricedShelfFrom,
  roundFrom,
  suppliersFrom,
  swapOptionsFrom,
  type ApiRiderDrop,
  type ApiSupplier,
  type ApiUpcoming,
  type PricedShelfRow,
  type RiderDrop,
  type SupplierChoice,
  type SwapOptions,
} from '@restaurant/surfaces/crew/live';

// Re-exported so the existing test and the pages keep their import path.
export { floorFrom, queueFrom, type ApprovalQueue, type WaiterFloor };

/**
 * The staff app's one seam to the API.
 *
 * House rule, and this surface has to follow it harder than most: types and
 * fixtures live in `crew-data.ts`, anything that calls the server lives here.
 * The panels are client components — a keypad, a zone filter, a masked total —
 * and `next/headers` cannot exist in a browser bundle. Next says so at build
 * time rather than at runtime, which is the good outcome; this file is the
 * answer, and only server components import it.
 *
 * ---------------------------------------------------------------------------
 * Its own fetcher, and not `@/lib/api-server`
 *
 * That module reads the console's session cookie. This app has a different one,
 * written by a different door — a device token and a PIN rather than a password
 * — and a phone in a waiter's apron is not the same principal as a browser in
 * the back office. Two cookies, two fetchers, and the alternative was a shared
 * one taking a cookie name, which is a parameter that exists to be passed
 * wrongly once.
 *
 * ---------------------------------------------------------------------------
 * Null is the answer, never an exception
 *
 * A dining room does not stop because an API restarted. Every function here
 * answers with fixtures and `live: false` when the server does not, and the
 * screen says so — a waiter reading last week's demo tables knows they are
 * reading a demo, and a blank screen mid-service would send them to the till.
 */

/** How long a screen waits before drawing fixtures instead. */
const TIMEOUT_MS = 4_000;

/** Laravel's paginated envelope. `meta.total` is the count, not `data.length`. */
type Paginated<T> = {
  data: T[];
  meta?: { total?: number };
};

async function crewGet<T>(path: string): Promise<T | null> {
  const store = await cookies();
  const token = store.get(CREW_SESSION_COOKIE)?.value;
  const tenant = store.get(CREW_TENANT_COOKIE)?.value;

  // Nobody is signed in. Asking anyway is a guaranteed 401 on every screen.
  if (token === undefined) return null;

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        /*
         * Sent even though a user token carries its own restaurant.
         *
         * `ResolveTenant` can infer one from the person, so this is redundant
         * for the session token — and it is not redundant the day a screen
         * reaches the API with the device token instead. Sending it always
         * costs a header and removes a class of "works on my machine".
         */
        ...(tenant === undefined ? {} : { 'X-Tenant': tenant }),
      },
      // A screen is per person and per request. Cached, one waiter's section
      // would be served to the next request that looked similar.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 401 and 403 are answers rather than errors: the session expired, or this
    // role does not hold the permission. Both mean "no data".
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * What the figures on this handset are about.
 *
 * The pinned venue when the phone has one, else the restaurant. Read from the
 * same context call the console uses; the tenant slug off the pairing cookie is
 * the last resort, because a slug is at least this restaurant's own word for
 * itself and the demo's branch name is not.
 */
export async function crewPlace(): Promise<string> {
  const answer = await crewGet<{
    branch?: { name: string } | null;
    branch_pinned?: boolean;
    tenant?: { name: string } | null;
  }>('/auth/context');

  if (answer?.branch_pinned && answer.branch) return answer.branch.name;
  if (answer?.tenant) return answer.tenant.name;

  return (await cookies()).get(CREW_TENANT_COOKIE)?.value ?? '';
}

/**
 * Which handset this is, read with the device token before anybody signs in.
 *
 * Its own fetch rather than `crewGet`: that one carries the SESSION cookie, and
 * on the sign-in screen there is no session — that is the whole point of the
 * screen. The credential here is the enrolment itself, which is also the
 * subject of the question.
 *
 * `null` when the phone is not enrolled, when the enrolment was revoked, or
 * when the API cannot be reached. The screen prints "not enrolled yet" for all
 * three, because from the person's side they are the same problem and the
 * answer to each is the same: find a manager.
 */
export async function enrolledDeviceLine(): Promise<string | null> {
  const phone = await enrolledPhone();

  if (phone === null) return null;

  try {
    const response = await fetch(`${apiBase()}/staff/devices/me`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${phone.token}`,
        // A device token carries no user, so the restaurant can only come from
        // the slug the pairing response handed back.
        'X-Tenant': phone.tenantSlug,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      data?: { label?: string | null; branch_code?: string | null };
    };
    const label = body.data?.label?.trim() ?? '';
    const branch = body.data?.branch_code?.trim() ?? '';

    // Branch first: it is the half a person is checking. Either alone is still
    // worth printing; neither means the API answered with an empty enrolment,
    // which is not something to dress up as an identity.
    const line = [branch, label].filter((part) => part !== '').join(' · ');

    return line === '' ? null : line;
  } catch {
    return null;
  }
}

/** Who is signed in on this handset, or null when nobody is. */
export async function crewPerson(): Promise<{ id: number; name: string } | null> {
  const answer = await crewGet<{ data?: { id: number; name: string } }>('/staff/auth/session');

  return answer?.data ?? null;
}

/* ============================================================
   A waiter's own section
   ============================================================ */

export async function waiterFloor(userId: number, lang: string): Promise<WaiterFloor> {
  const [tables, halls, orders] = await Promise.all([
    crewGet<Paginated<ApiTable>>('/tables/tables?per_page=200'),
    crewGet<Paginated<ApiHall>>('/tables/halls?per_page=50'),
    crewGet<Paginated<ApiOrder>>(
      `/orders/orders?per_page=100&filter[waiter]=${userId}&filter[open]=true`,
    ),
  ]);

  if (!tables?.data || !orders?.data) {
    return { tables: MY_TABLES, zones: ZONES, live: false };
  }

  return floorFrom(tables.data, halls?.data ?? [], orders.data, lang, Date.now());
}

/* ============================================================
   The dock's search
   ============================================================ */

export type CrewFound = {
  dishes: readonly MenuRow[];
  tables: readonly FoundTable[];
  /** False when nothing was asked, or when both reads were refused. */
  live: boolean;
};

/**
 * What a crew phone can genuinely search — the menu and the floor.
 *
 * The design's own handler is a toast reading "order, table, guest, item", and
 * this dock long carried no search box at all rather than ship one that could
 * not search. Two of those four now answer a partial word — `filter[search]` on
 * the menu, and one added to `tables` for this — so the box searches those two
 * and names its reach under the field.
 *
 * **Both searches run on the server.** Filtering a downloaded page here would
 * have capped the search at whatever fitted in `per_page`: a restaurant with
 * 300 dishes would find the first 200 and be told the rest do not exist.
 *
 * **Two reads, settled apart.** A cook has `menu.view` and not `tables.view`, so
 * one of these legitimately refuses for some of the people holding the phone;
 * failing the whole search on that would answer "nothing found", which is a lie.
 * A refused half is simply absent, and `live` is false only when *both* refuse —
 * a dead session or a dead network.
 *
 * No fixture here, unlike the floor. A search that answered a refused read with
 * six sample dishes would be telling somebody their restaurant sells a thing it
 * does not.
 */
export async function crewSearch(term: string, lang: string): Promise<CrewFound> {
  const q = term.trim();

  /* One letter is not a search, it is the first keystroke of one. */
  if (q.length < 2) return { dishes: [], tables: [], live: false };

  const query = encodeURIComponent(q);

  const [dishes, tables, halls] = await Promise.all([
    crewGet<Paginated<ApiMenuItem>>(
      `/menu/items?per_page=20&include=category&filter[search]=${query}`,
    ),
    crewGet<Paginated<ApiTable>>(`/tables/tables?per_page=20&filter[search]=${query}`),
    crewGet<Paginated<ApiHall>>('/tables/halls?per_page=50'),
  ]);

  if (dishes?.data === undefined && tables?.data === undefined) {
    return { dishes: [], tables: [], live: false };
  }

  return {
    dishes: dishes?.data === undefined ? [] : menuFrom(dishes.data, lang),
    tables: tables?.data === undefined ? [] : foundTablesFrom(tables.data, halls?.data ?? [], lang),
    live: true,
  };
}

/* ============================================================
   The owner's and the manager's home tab
   ============================================================ */

export type CrewTodayBoard = { board: TodayBoard; live: boolean };

/**
 * Today, for whoever is holding the phone.
 *
 * `GET /api/v1/dashboard?role=` answers a different shape per role and the role
 * is named here because the crew app's dock already knows which of the two tabs
 * it drew. The API scopes by permission regardless — a waiter's token asking
 * for the owner's shape gets the waiter's figures.
 *
 * The fixture is returned ONLY when the endpoint did not answer, and the panel
 * says so on screen. It used to be returned always: the first thing an owner
 * saw in this app was an eighteen-million trading day across five branches that
 * belonged to the demo restaurant, with no label anywhere to say so.
 */
export async function crewToday(
  role: 'owner' | 'manager',
  lang: string,
  place: string,
): Promise<CrewTodayBoard> {
  const answer = await crewGet<{ data: ApiCrewDashboard }>(`/dashboard?role=${role}`);

  if (!answer?.data) return { board: TODAY[role], live: false };

  const t = copy(TODAY_COPY, lang as Lang);

  const KPI_LABEL: Readonly<Record<string, string>> = {
    orders: t.kOrders,
    average_cheque: t.kAverage,
    gross_profit: t.kGross,
    expenses: t.kExpenses,
    food_cost: t.kFoodCost,
    covers: t.kCovers,
    open_orders: t.kOpen,
  };

  return {
    board: todayFrom(
      answer.data,
      {
        revenueLabel: fill(t.revenueAt, { place }),
        revenueNote: t.inclVat,
        listLabel: role === 'owner' ? t.branches : t.waiters,
        // An unknown key keeps the server's own word rather than rendering
        // blank: a card with no heading is worse than one headed `food_cost`.
        kpi: (key) => KPI_LABEL[key] ?? key,
      },
      role,
    ),
    live: true,
  };
}

/* ============================================================
   What a manager is being asked to sign
   ============================================================ */

export async function approvalQueue(): Promise<ApprovalQueue> {
  const answer = await crewGet<Paginated<ApiApproval>>(
    '/pos/approvals?per_page=25&filter[status]=pending',
  );

  if (!answer?.data) return { items: APPROVALS, live: false };

  return { items: queueFrom(answer.data, Date.now()), live: true };
}

/* ============================================================
   Which tables have their hand up
   ============================================================ */

export type CrewCalls = { calls: readonly Call[]; live: boolean };

/**
 * The open calls — `GET /api/v1/tables/calls`.
 *
 * The panel drew three sample cards and its "done" button set a local flag, so
 * two waiters could both clear the same call, the kitchen kept chasing it, and
 * it came back on the next reload. The endpoint has existed since the QR
 * screen's two buttons became real.
 */
export async function waiterCalls(lang: string): Promise<CrewCalls> {
  const answer = await crewGet<{ data: ApiWaiterCall[] }>('/tables/calls?limit=50');

  if (!answer?.data) return { calls: CALLS, live: false };

  const t = copy(CALLS_COPY, lang as Lang);

  return {
    calls: callsFrom(answer.data, {
      table: t.table,
      seat: t.seat,
      title: { ready: t.titleReady, guest: t.titleGuest, bill: t.titleBill },
      body: { ready: t.bodyReady, guest: t.bodyGuest, bill: t.bodyBill },
      action: { ready: t.actionReady, guest: t.actionGuest, bill: t.actionBill },
    }),
    live: true,
  };
}

/* ============================================================
   The storekeeper's shelf and the vans at the door
   ============================================================ */

/** The shelf, with the ingredient ids a count has to carry. */
export type Shelf = { rows: readonly ShelfRow[]; live: boolean };

/**
 * What is on the shelf — `GET /api/v1/inventory/ingredients`.
 *
 * One read behind two screens. The count sheet needs the name, the unit and
 * above all the **id**, because `count_submit` is keyed on `ingredient_id` and
 * a sheet of word ids had nothing to send; the stock screen needs the same rows
 * with their cover days. Fetching twice would be two lists that can disagree
 * about what the restaurant stocks.
 *
 * The count screen keeps the console's rule and this read does not break it:
 * `ShelfRow` carries what is on hand, and `CountPanel` never draws it. Somebody
 * counting a shelf while looking at what the computer expects counts to it.
 */
export async function shelf(lang: string): Promise<Shelf> {
  const answer = await crewGet<Paginated<ApiIngredient>>(
    '/inventory/ingredients?per_page=100&filter[is_active]=1&sort=name',
  );

  if (!answer?.data) {
    // `COUNT_ITEMS` and `STOCK` are two halves of one fixture list, and the
    // fallback keeps them that way — the count sheet's rows plus the cover
    // figures the stock tab draws, so neither screen loses its demo.
    return {
      rows: COUNT_ITEMS.map((item, index) => ({
        ...item,
        onHand: STOCK[index]?.onHand ?? '',
        days: STOCK[index]?.days ?? 99,
      })),
      live: false,
    };
  }

  return { rows: shelfFrom(answer.data, lang), live: true };
}

/** Today's vans, with the purchase order ids a confirmation has to carry. */
export type Deliveries = { rows: readonly CrewDelivery[]; live: boolean };

/**
 * What is arriving — `GET /api/v1/suppliers/purchase-orders`.
 *
 * Only the orders that are still coming. A received one is paperwork rather
 * than work: it would sit at the top of a storekeeper's morning with a button
 * that could only book it twice, which is the one mistake on this screen that
 * costs money instead of time.
 */
export async function deliveries(): Promise<Deliveries> {
  const answer = await crewGet<Paginated<ApiPurchaseOrder>>(
    '/suppliers/purchase-orders?per_page=25&include=supplier,items&sort=expected_at',
  );

  if (!answer?.data) return { rows: DELIVERIES, live: false };

  return {
    rows: deliveriesFrom(
      answer.data.filter((order) => order.status !== 'received' && order.status !== 'cancelled'),
      Date.now(),
    ),
    live: true,
  };
}

/* ============================================================
   The menu, for the waiter's order pad
   ============================================================ */

export type CrewMenu = { rows: readonly MenuRow[]; live: boolean };

/**
 * What this restaurant sells — `GET /api/v1/menu/items`.
 *
 * A waiter holds `menu.view` and nothing more of that module, which is exactly
 * the shape this needs: read the card, never edit it. The sold-out flag comes
 * down with the row so the order pad can dim a dish the kitchen has 86'd rather
 * than letting it be tapped — reading the wrong price to a guest is an apology,
 * and putting a stopped dish on a bill is an apology plus a re-cook plus
 * usually a discount.
 */
export async function crewMenu(lang: string): Promise<CrewMenu> {
  const answer = await crewGet<Paginated<ApiMenuItem>>(
    '/menu/items?per_page=200&include=category&sort=sort_order',
  );

  if (!answer?.data) return { rows: MENU_ROWS, live: false };

  return { rows: menuFrom(answer.data, lang), live: true };
}

/* ============================================================
   One table, opened
   ============================================================ */

export type TableDetail = {
  table: MyTable;
  lines: readonly OrderLine[];
  live: boolean;
};

/**
 * The table behind `/crew/{role}/table/{id}`, and the bill on it.
 *
 * This screen used to look the id up in `MY_TABLES` and `notFound()` on a miss,
 * which worked for exactly as long as the floor was fixtures. `floorFrom()`
 * keys a live table by its database id, so from the moment the grid went live
 * every table on it led to a 404 — the one navigation a waiter makes most
 * often, broken by the read that was supposed to fix the screen.
 *
 * So the floor is asked first and the fixture is the fallback, which is the
 * same order every other screen here uses. `null` means the id belongs to
 * neither, and only then is it a 404.
 *
 * The lines come from the order's own show call, which already loads them —
 * `GET /orders/orders/{id}` — rather than from a second query, because the two
 * would be a table's bill read twice and able to disagree about it.
 */
export async function tableDetail(tableId: string, lang: string): Promise<TableDetail | null> {
  const person = await crewPerson();
  const floor = person === null ? null : await waiterFloor(person.id, lang);
  const live = floor?.live ?? false;

  const table = (live ? floor?.tables : MY_TABLES)?.find((row) => row.id === tableId);

  if (table === undefined) {
    // A live floor that does not carry this table is a table somebody else has
    // taken, or one out of service. The fixture is checked anyway so a demo
    // deep link still opens on a console with no session.
    const sample = MY_TABLES.find((row) => row.id === tableId);

    return sample === undefined
      ? null
      : { table: sample, lines: TABLE_LINES[tableId] ?? [], live: false };
  }

  if (!live || table.orderId === undefined) {
    return { table, lines: live ? [] : (TABLE_LINES[tableId] ?? []), live };
  }

  const answer = await crewGet<{ data?: { items?: readonly ApiOrderItem[] } }>(
    `/orders/orders/${table.orderId}?include=items`,
  );

  return { table, lines: tableLinesFrom(answer?.data?.items ?? []), live: true };
}

/* ============================================================
   What the four More forms were missing: ids
   ============================================================ */

export type PricedShelf = { rows: readonly PricedShelfRow[]; live: boolean };

/**
 * The shelf with a price on every line — for the waste and reorder sheets.
 *
 * A second call rather than a field on `shelf()`, and the split is the count
 * screen's rule made structural: `ShelfRow` carries no price because a
 * storekeeper who can see what a shelf is worth while counting it counts
 * towards a number. These two forms are the opposite case — both are about
 * money leaving, and a running total is the whole point of the screen.
 *
 * `live: false` means the fixture, and the forms then queue nothing: `w1` is a
 * word and `waste_log` is keyed on `ingredient_id`.
 */
export async function pricedShelf(lang: string): Promise<PricedShelf> {
  const answer = await crewGet<Paginated<ApiIngredient>>(
    '/inventory/ingredients?per_page=100&filter[is_active]=1&sort=name',
  );

  if (!answer?.data) return { rows: [], live: false };

  return { rows: pricedShelfFrom(answer.data, lang), live: true };
}

/** Who a reorder can be addressed to — `GET /api/v1/suppliers/suppliers`. */
export async function crewSuppliers(): Promise<{
  rows: readonly SupplierChoice[];
  live: boolean;
}> {
  const answer = await crewGet<Paginated<ApiSupplier>>('/suppliers/suppliers?per_page=100');

  if (!answer?.data) return { rows: [], live: false };

  return { rows: suppliersFrom(answer.data), live: true };
}

/**
 * The swap form's two lists — `GET /api/v1/staff/me/upcoming`.
 *
 * Unguarded upstream because it answers about the caller, which is what makes
 * it usable from a waiter's handset at all: `GET /staff/shifts` is behind
 * `staff.view` and a waiter does not hold it.
 */
export async function swapOptions(lang: string): Promise<SwapOptions & { live: boolean }> {
  const answer = await crewGet<{ data?: ApiUpcoming }>('/staff/me/upcoming');

  if (!answer?.data) return { shifts: [], colleagues: [], live: false };

  return { ...swapOptionsFrom(answer.data, lang), live: true };
}

/**
 * This rider's own round — `GET /api/v1/orders/deliveries/mine`.
 *
 * The hand-back screen's missing half. It collects a *reason*, which is right
 * for the design — a courier hands back the bag in their hand — and useless for
 * the payload, because `delivery_status` is keyed on `order_id`. The
 * dispatcher's board would have answered with everybody's evening; this one
 * answers with the caller's.
 */
export async function riderRound(): Promise<{ drops: readonly RiderDrop[]; live: boolean }> {
  const answer = await crewGet<{ data?: readonly ApiRiderDrop[] }>('/orders/deliveries/mine');

  if (!answer?.data) return { drops: [], live: false };

  return { drops: roundFrom(answer.data), live: true };
}

/* ============================================================
   What this person has already ticked off today
   ============================================================ */

export type CrewChecklist = {
  /** `list:step` for every tick the server holds for this person today. */
  ticked: readonly string[];
  /** The last cash declaration of the trading day, tiyin, or null. */
  declaredTiyin: number | null;
  live: boolean;
};

/**
 * `GET /api/v1/staff/checklists/today`.
 *
 * The read that makes the ticks worth queueing. Until it existed the closing
 * run-through lived in component state: a phone that slept mid-round restarted
 * the list, and two people sharing one handset each saw an empty one.
 *
 * Keys are joined into one string because that is what a `Set` of ticks wants
 * to be — the panels ask "is `closing:fridges` done", and a nested object would
 * make every panel write the same two-level lookup.
 */
export async function crewChecklist(): Promise<CrewChecklist> {
  const answer = await crewGet<{
    data?: {
      ticks?: readonly { list?: string; step?: string }[];
      cash_handover?: { amount_tiyin?: number } | null;
    };
  }>('/staff/checklists/today');

  if (!answer?.data) return { ticked: [], declaredTiyin: null, live: false };

  const ticked: string[] = [];

  for (const tick of answer.data.ticks ?? []) {
    if (typeof tick.list === 'string' && typeof tick.step === 'string') {
      ticked.push(`${tick.list}:${tick.step}`);
    }
  }

  const declared = answer.data.cash_handover?.amount_tiyin;

  return {
    ticked,
    declaredTiyin: typeof declared === 'number' && declared > 0 ? declared : null,
    live: true,
  };
}
