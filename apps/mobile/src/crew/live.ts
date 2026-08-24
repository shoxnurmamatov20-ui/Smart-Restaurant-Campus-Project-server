import { CALLS_COPY, copy, fill, TODAY as TODAY_COPY } from '@restaurant/surfaces/crew/copy';
import {
  ALERTS,
  APPROVALS,
  BRANCHES,
  MENU_ROWS,
  MINUTE_WORD,
  MY_TABLES,
  TODAY,
  ZONES,
  type Alert,
  type BranchRow,
  type Call,
  type Lang,
  type MenuRow,
  type TodayBoard,
} from '@restaurant/surfaces/crew/data';
import {
  alertsFrom,
  branchesFrom,
  callsFrom,
  deliveriesFrom,
  floorFrom,
  menuFrom,
  myDayFrom,
  pricedShelfFrom,
  queueFrom,
  roundFrom,
  shelfFrom,
  foundTablesFrom,
  suppliersFrom,
  swapOptionsFrom,
  todayFrom,
  type ApiApproval,
  type ApiBranchRow,
  type ApiCrewDashboard,
  type ApiNotification,
  type ApiHall,
  type ApiIngredient,
  type ApiMenuItem,
  type ApiMyDay,
  type ApiOrder,
  type ApiPurchaseOrder,
  type ApiRiderDrop,
  type ApiSupplier,
  type ApiTable,
  type ApiUpcoming,
  type ApiWaiterCall,
  type ApprovalQueue,
  type CrewDelivery,
  type FoundTable,
  type MyDay,
  type PricedShelfRow,
  type RiderDrop,
  type ShelfRow,
  type SupplierChoice,
  type SwapOptions,
  type WaiterFloor,
} from '@restaurant/surfaces/crew/live';
import type { PaginatedResponse } from '@restaurant/types';

import { get, post } from '@/lib/api';
import { useLive, type Live } from '@/lib/live';
import { KEYS, read } from '@/lib/storage';

import { enrolment } from './session';

/**
 * The two screens that read the server: a waiter's floor and a manager's queue.
 *
 * The same three endpoints the web build reads in `crew-server.ts`, through the
 * same two mappings — `floorFrom()` and `queueFrom()` now live in
 * `@restaurant/surfaces/crew/live` precisely so a phone and a browser cannot
 * disagree about whose tables those are or what a refund looks like.
 *
 * What differs is the failure mode. The web build answers fixtures with
 * `live: false` and the screen prints "Namunaviy stollar". This does the same,
 * for the same reason — a waiter mid-shift is better served by a recognisable
 * floor than by a spinner — but it also keeps the error, so the screen can say
 * *why* it is showing the sample rather than just that it is.
 */

/** The staff session: its bearer and the tenant the phone was paired to. */
async function scope() {
  const phone = await enrolment();

  return {
    bearer: KEYS.crewSession,
    tenant: phone?.tenant ?? null,
  } as const;
}

/** Who is holding the phone, from the session the PIN opened. */
export async function crewPerson(): Promise<{ id: number; name: string } | null> {
  const answer = await get<{ data?: { id: number; name: string } }>(
    '/staff/auth/session',
    await scope(),
  );

  return answer.data ?? null;
}

export async function waiterFloor(userId: number, lang: string): Promise<WaiterFloor> {
  const s = await scope();

  const [tables, halls, orders] = await Promise.all([
    get<PaginatedResponse<ApiTable>>('/tables/tables?per_page=200', s),
    get<PaginatedResponse<ApiHall>>('/tables/halls?per_page=50', s),
    get<PaginatedResponse<ApiOrder>>(
      `/orders/orders?per_page=100&filter[waiter]=${userId}&filter[open]=true`,
      s,
    ),
  ]);

  return floorFrom(tables.data, halls.data, orders.data, lang, Date.now());
}

export async function approvalQueue(): Promise<ApprovalQueue> {
  const answer = await get<PaginatedResponse<ApiApproval>>(
    '/pos/approvals?per_page=25&filter[status]=pending',
    await scope(),
  );

  return { items: queueFrom(answer.data, Date.now()), live: true };
}

/**
 * The shift the person holding this phone is on.
 *
 * The one call in this file that is about the caller rather than about the
 * restaurant, which is why it carries no permission: a waiter reads their own
 * hours and nobody else's. `GET /staff/me/today`.
 */
export async function myDay(lang: string): Promise<MyDay> {
  const answer = await get<{ data: ApiMyDay }>('/staff/me/today', await scope());

  return myDayFrom(answer.data, lang);
}

/* ============================================================
   The four screens a role opens first
   ============================================================ */

/**
 * What the figures on this handset are about — `GET /auth/context`.
 *
 * The pinned venue when the phone has one, else the restaurant. It is a label
 * and nothing else, but the label is the difference between "Bugungi tushum"
 * and "Bugungi tushum · Chilonzor": the first real owner to open this app saw
 * an eighteen-million trading day across five branches that belonged to the
 * demo restaurant, with nothing on the screen to say so.
 */
export async function crewPlace(): Promise<string> {
  const answer = await get<{
    branch?: { name: string } | null;
    branch_pinned?: boolean;
    tenant?: { name: string } | null;
  }>('/auth/context', await scope());

  if (answer.branch_pinned && answer.branch) return answer.branch.name;

  return answer.tenant?.name ?? '';
}

/**
 * The home screen's figures — `GET /dashboard?role=…`.
 *
 * `dashboard.view` rather than `analytics.view`, which is what makes it
 * reachable from a waiter's handset at all: the wider permission opens the
 * venue's sales reports and its food cost, and four of the seven roles were
 * getting a 403 on their own home screen and falling back to sample figures
 * without saying so.
 *
 * The labels are resolved here rather than inside the mapper because the mapper
 * is shared with the browser and knows nothing about a catalogue.
 */
export async function crewToday(
  role: 'owner' | 'manager',
  lang: string,
  place: string,
): Promise<TodayBoard> {
  const answer = await get<{ data: ApiCrewDashboard }>(`/dashboard?role=${role}`, await scope());
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

  return todayFrom(
    answer.data,
    {
      revenueLabel: fill(t.revenueAt, { place }),
      revenueNote: t.inclVat,
      listLabel: role === 'owner' ? t.branches : t.waiters,
      // An unknown key keeps the server's own word rather than rendering blank:
      // a card with no heading is worse than one headed `food_cost`.
      kpi: (key) => KPI_LABEL[key] ?? key,
    },
    role,
  );
}

/**
 * The tables with their hand up — `GET /tables/calls`.
 *
 * The panel drew three sample cards whose "done" button set a local flag, so
 * two waiters could both clear the same call, the kitchen kept chasing it, and
 * it came back on the next reload.
 */
export async function waiterCalls(lang: string): Promise<readonly Call[]> {
  const answer = await get<{ data: readonly ApiWaiterCall[] }>(
    '/tables/calls?limit=50',
    await scope(),
  );
  const t = copy(CALLS_COPY, lang as Lang);

  return callsFrom(answer.data, {
    table: t.table,
    seat: t.seat,
    title: { ready: t.titleReady, guest: t.titleGuest, bill: t.titleBill },
    body: { ready: t.bodyReady, guest: t.bodyGuest, bill: t.bodyBill },
    action: { ready: t.actionReady, guest: t.actionGuest, bill: t.actionBill },
  });
}

/**
 * What this restaurant sells — `GET /menu/items`.
 *
 * A waiter holds `menu.view` and nothing more of that module, which is the
 * shape this needs: read the card, never edit it. The sold-out flag rides down
 * with the row so a dish the kitchen has 86'd can be dimmed rather than tapped
 * — reading the wrong price to a guest is an apology, and putting a stopped
 * dish on a bill is an apology plus a re-cook plus usually a discount.
 */
export async function crewMenu(lang: string): Promise<readonly MenuRow[]> {
  const answer = await get<PaginatedResponse<ApiMenuItem>>(
    '/menu/items?per_page=200&include=category&sort=sort_order',
    await scope(),
  );

  return menuFrom(answer.data, lang);
}

/**
 * What is on the shelf — `GET /inventory/ingredients`.
 *
 * One read behind two tabs: the count sheet needs the name, the unit and above
 * all the **id**, because `count_submit` is keyed on `ingredient_id`; the stock
 * tab needs the same rows with their cover days. Fetching twice would be two
 * lists able to disagree about what the restaurant stocks.
 */
export async function shelf(lang: string): Promise<readonly ShelfRow[]> {
  const answer = await get<PaginatedResponse<ApiIngredient>>(
    '/inventory/ingredients?per_page=100&filter[is_active]=1&sort=name',
    await scope(),
  );

  return shelfFrom(answer.data, lang);
}

/**
 * What is arriving — `GET /suppliers/purchase-orders`.
 *
 * Only the orders still coming. A received one is paperwork rather than work:
 * it would sit at the top of a storekeeper's morning with a button that could
 * only book it twice, which is the one mistake on this screen that costs money
 * instead of time.
 */
export async function deliveries(): Promise<readonly CrewDelivery[]> {
  const answer = await get<PaginatedResponse<ApiPurchaseOrder>>(
    '/suppliers/purchase-orders?per_page=25&include=supplier,items&sort=expected_at',
    await scope(),
  );

  return deliveriesFrom(
    answer.data.filter((order) => order.status !== 'received' && order.status !== 'cancelled'),
    Date.now(),
  );
}

export type { Live };

export const useWaiterFloor = (lang: string): Live<WaiterFloor> =>
  useLive(
    async () => {
      const person = await crewPerson();

      if (person === null) throw new Error('no session');

      return waiterFloor(person.id, lang);
    },
    { tables: MY_TABLES, zones: ZONES, live: false },
    lang,
  );

export const useApprovalQueue = (): Live<ApprovalQueue> =>
  useLive(approvalQueue, { items: APPROVALS, live: false }, 'queue');

/**
 * The waiter's own day, for the shift screen's header.
 *
 * The fixture is deliberately empty rather than a plausible shift. Every other
 * fallback in this file stands in a recognisable floor or a recognisable queue,
 * because a waiter mid-service is better served by those than by a spinner —
 * but a *rostered time* is a thing somebody plans an evening around, and
 * inventing one would be the single most harmful sample value in the app.
 * `live: false` and nothing shown is the honest answer.
 */
export const useStaffToday = (lang: string): Live<MyDay> =>
  useLive(
    () => myDay(lang),
    {
      rostered: null,
      clockedIn: false,
      clockedInAt: null,
      worked: '0:00',
      workedMinutes: 0,
      late: false,
      next: null,
      live: false,
    },
    lang,
  );

/**
 * The home screen, live.
 *
 * The fixture stands in, because these are figures a person reads rather than
 * acts on and a blank home screen mid-service tells them nothing. What makes
 * that safe is the line above it: `TODAY_COPY.demoFigures` names what is a
 * sample, and the first real owner's complaint was precisely that nothing did.
 *
 * `place` is threaded in rather than read here so the header and the hero label
 * cannot disagree about which venue the day belongs to.
 */
export const useCrewToday = (
  role: 'owner' | 'manager',
  lang: string,
  place: string,
): Live<TodayBoard> =>
  useLive(() => crewToday(role, lang, place), TODAY[role], `today:${role}:${lang}:${place}`);

/**
 * The calls, live — and empty when they are not.
 *
 * No fixture here, unlike the floor. Every card on this screen carries a button
 * that writes, and a waiter clearing a sample call has cleared nothing while
 * believing they have: the guest is still waiting and the screen says they are
 * not. An empty list with the reason above it is the honest answer.
 */
export const useWaiterCalls = (lang: string): Live<readonly Call[]> =>
  useLive(() => waiterCalls(lang), [], `calls:${lang}`);

/* ============================================================
   The dock's search
   ============================================================ */

export type CrewFound = {
  dishes: readonly MenuRow[];
  tables: readonly FoundTable[];
};

export const NOTHING_FOUND: CrewFound = { dishes: [], tables: [] };

/**
 * What a crew phone can genuinely search — the menu and the floor.
 *
 * The design's own handler is a toast reading "order, table, guest, item", and
 * this app long carried no search box at all rather than ship one that could
 * not search: four entities behind one field needs an endpoint nobody has
 * written, and a box that swallows what you type teaches people the app is
 * broken. Two of the four *do* have endpoints, so the box searches those two and
 * says so out loud — `SHARED.searchScope` sits under the field naming its reach.
 *
 * **Both searches run on the server.** `filter[search]` on the menu was already
 * there; the one on `tables` was added for this. Filtering a downloaded page
 * here instead would have quietly capped the search at whatever fitted in
 * `per_page` — a restaurant with 300 dishes would find the first 200 and be told
 * the rest do not exist.
 *
 * **Two reads, settled apart.** A cook has `menu.view` and not `tables.view`, so
 * one of these legitimately refuses for some of the people holding the phone.
 * Failing the whole search on that would answer "nothing found" — a lie — so a
 * refused half is simply absent, and only a *pair* of failures is raised, which
 * is what a dead session or a dead network looks like.
 */
export async function crewSearch(term: string, lang: string): Promise<CrewFound> {
  const q = term.trim();

  /*
   * One letter is not a search, it is the first keystroke of one. Firing on it
   * costs a round trip per word and answers with most of the menu.
   */
  if (q.length < 2) return NOTHING_FOUND;

  const s = await scope();
  const query = encodeURIComponent(q);

  const [dishes, tables] = await Promise.all([
    get<PaginatedResponse<ApiMenuItem>>(
      `/menu/items?per_page=20&include=category&filter[search]=${query}`,
      s,
    ).then(
      (answer) => menuFrom(answer.data, lang),
      (error: unknown) => error as Error,
    ),
    Promise.all([
      get<PaginatedResponse<ApiTable>>(`/tables/tables?per_page=20&filter[search]=${query}`, s),
      get<PaginatedResponse<ApiHall>>('/tables/halls?per_page=50', s),
    ]).then(
      ([rows, halls]) => foundTablesFrom(rows.data, halls.data, lang),
      (error: unknown) => error as Error,
    ),
  ]);

  if (dishes instanceof Error && tables instanceof Error) throw dishes;

  return {
    dishes: dishes instanceof Error ? [] : dishes,
    tables: tables instanceof Error ? [] : tables,
  };
}

/**
 * The search, live — and empty rather than sampled.
 *
 * No fixture, and this is the clearest case for that rule in the app: a search
 * that answered a refused read with six sample dishes would be telling somebody
 * their restaurant sells a thing it does not.
 */
export const useCrewSearch = (term: string, lang: string): Live<CrewFound> =>
  useLive(() => crewSearch(term, lang), NOTHING_FOUND, `search:${term.trim()}:${lang}`);

/** The card, live. A menu is read, so the sample is safe with its line above it. */
export const useCrewMenu = (lang: string): Live<readonly MenuRow[]> =>
  useLive(() => crewMenu(lang), MENU_ROWS, `menu:${lang}`);

/**
 * The shelf and the vans, live — both empty when they are not.
 *
 * Same rule as the calls and for a sharper reason: a count is submitted against
 * `ingredient_id` and a delivery is confirmed against a purchase order id.
 * Fixture rows carry word ids, so every row on a sample shelf is a form that
 * cannot be sent — and a storekeeper writing off five kilos of a fixture has
 * written off nothing, twice.
 */
export const useShelf = (lang: string): Live<readonly ShelfRow[]> =>
  useLive(() => shelf(lang), [], `shelfrows:${lang}`);

export const useDeliveries = (): Live<readonly CrewDelivery[]> =>
  useLive(deliveries, [], 'deliveries');

/**
 * What the restaurant wants somebody to know — `GET /notifications`.
 *
 * The same tray the console's bell reads. Not a crew-specific feed, because a
 * cash variance is the same fact whether it is read at the desk or on the way
 * home, and two sources would be two lists able to disagree about whether it
 * had been dealt with.
 */
export async function crewAlerts(): Promise<readonly Alert[]> {
  const answer = await get<PaginatedResponse<ApiNotification>>(
    '/notifications?per_page=20',
    await scope(),
  );

  return alertsFrom(answer.data, Date.now(), {
    minutesAgo: (minutes) => ({
      uz: `${minutes} ${MINUTE_WORD.uz}`,
      ru: `${minutes} ${MINUTE_WORD.ru}`,
      en: `${minutes} ${MINUTE_WORD.en}`,
    }),
  });
}

/**
 * The tray, live. The sample stands in when the server refuses, because these
 * are read and never answered — the panel deliberately has no dismiss button —
 * and a blank list would read as "nothing is wrong".
 */
export const useCrewAlerts = (): Live<readonly Alert[]> => useLive(crewAlerts, ALERTS, 'alerts');

/**
 * The owner's venues, ranked — `GET /analytics/branches`.
 *
 * The same report the console's Branches screen draws, scoped exactly as the
 * caller is: an owner with no pinned venue gets every row, a manager pinned to
 * one gets one. That is the platform's own "an empty branch is a roll-up" rule
 * and this screen inherits it rather than asking for all of them.
 */
export async function crewBranches(): Promise<readonly BranchRow[]> {
  const answer = await get<{ data?: { branches?: readonly ApiBranchRow[] } }>(
    '/analytics/branches?period=today',
    await scope(),
  );

  return branchesFrom(answer.data?.branches ?? []);
}

/**
 * The venues, live. The sample stands in on a refusal — these are figures an
 * owner reads rather than acts on, and the line above says which they are.
 */
export const useCrewBranches = (): Live<readonly BranchRow[]> =>
  useLive(crewBranches, BRANCHES, 'branches');

/** Which venue the figures are about, for the hero label. */
export const useCrewPlace = (): Live<string> => useLive(crewPlace, '', 'place');

/* ============================================================
   What the More forms and the cash tab were missing: ids
   ============================================================ */

/**
 * The shelf, priced — for the waste sheet.
 *
 * `waste_log` is keyed on `ingredient_id` and this form drew `w1`…`w5`, so the
 * native build stopped queueing it entirely rather than leaving entries with no
 * verb sitting in a memory-only list for ever. This is the read that gives it
 * one back.
 *
 * The count sheet deliberately reads the OTHER shape (`shelfFrom`, no price):
 * somebody counting a shelf while looking at what it is worth counts towards a
 * number.
 */
export async function pricedShelf(lang: string): Promise<readonly PricedShelfRow[]> {
  const answer = await get<PaginatedResponse<ApiIngredient>>(
    '/inventory/ingredients?per_page=100&filter[is_active]=1&sort=name',
    await scope(),
  );

  return pricedShelfFrom(answer.data, lang);
}

/**
 * This rider's own round — `GET /orders/deliveries/mine`.
 *
 * The one delivery read that answers about the caller. `orders/deliveries` is
 * the dispatcher's board and would hand a rider everybody's evening; a hand-back
 * needs `order_id` and could not have it until this seam existed.
 */
export async function riderRound(): Promise<readonly RiderDrop[]> {
  const answer = await get<{ data: readonly ApiRiderDrop[] }>(
    '/orders/deliveries/mine',
    await scope(),
  );

  return roundFrom(answer.data);
}

/** What this person has already ticked off, and what they declared carrying. */
export type CrewChecklist = {
  /** `list:step` for each tick — see `ChecklistController` for the shape. */
  ticked: readonly string[];
  declaredTiyin: number | null;
};

/**
 * `GET /staff/checklists/today`.
 *
 * The read that makes a tick worth queueing. Without it the closing
 * run-through lived in component state, and on this build that state does not
 * even survive the app being killed.
 */
export async function crewChecklist(): Promise<CrewChecklist> {
  const answer = await get<{
    data?: {
      ticks?: readonly { list?: string; step?: string }[];
      cash_handover?: { amount_tiyin?: number } | null;
    };
  }>('/staff/checklists/today', await scope());

  const ticked: string[] = [];

  for (const tick of answer.data?.ticks ?? []) {
    if (typeof tick.list === 'string' && typeof tick.step === 'string') {
      ticked.push(`${tick.list}:${tick.step}`);
    }
  }

  const declared = answer.data?.cash_handover?.amount_tiyin;

  return {
    ticked,
    declaredTiyin: typeof declared === 'number' && declared > 0 ? declared : null,
  };
}

/**
 * The swap form's two lists — `GET /staff/me/upcoming`.
 *
 * Unguarded upstream because it answers about the caller, which is what makes
 * it reachable from a waiter's handset at all: `GET /staff/shifts` is behind
 * `staff.view` and a waiter does not hold it. It carries three fields per
 * colleague — id, name, position — and no wage and no telephone.
 */
export async function swapOptions(lang: string): Promise<SwapOptions> {
  const answer = await get<{ data: ApiUpcoming }>('/staff/me/upcoming', await scope());

  return swapOptionsFrom(answer.data, lang);
}

/** Who a reorder can be addressed to — `GET /suppliers/suppliers`. */
export async function crewSuppliers(): Promise<readonly SupplierChoice[]> {
  const answer = await get<PaginatedResponse<ApiSupplier>>(
    '/suppliers/suppliers?per_page=100',
    await scope(),
  );

  return suppliersFrom(answer.data);
}

/**
 * Raise a swap — `POST /staff/shift-swaps`.
 *
 * Not queued, and that is the difference from everything else this app sends.
 * A swap request is a conversation with a manager; raised twice by a drained
 * queue it is two rows in somebody's approvals with no natural key to collapse
 * them. The server already refuses a second pending request per shift, and
 * showing that refusal is more use than hiding it behind a retry.
 */
export async function raiseSwap(shiftId: number, offeredToId: number | null): Promise<void> {
  await post(
    '/staff/shift-swaps',
    { shift_id: shiftId, offered_to_id: offeredToId },
    await scope(),
  );
}

/**
 * Raise a reorder — `POST /suppliers/purchase-orders`.
 *
 * `draft`, never `sent`: a storekeeper at a service entrance is raising a
 * request, and the person who decides this restaurant buys twenty-five kilos of
 * lamb this week is a manager looking at a bank balance. `unit_price` is zero
 * for the same reason — a draft raised from a phone carries no agreed price,
 * and sending the shelf's last cost as though it were one puts a number on a
 * document somebody signs.
 *
 * Also not queued: a purchase order raised twice is stock ordered twice.
 */
export async function raisePurchase(
  supplierId: number,
  lines: readonly { ingredientId: number; name: string; unit: string; quantity: number }[],
): Promise<void> {
  await post(
    '/suppliers/purchase-orders',
    {
      supplier_id: supplierId,
      status: 'draft',
      items: lines.map((line) => ({
        ingredient_id: line.ingredientId,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        unit_price: 0,
      })),
    },
    await scope(),
  );
}

/**
 * The five hooks the screens use, each with an honest empty fallback.
 *
 * Empty rather than the design's rows, which is the opposite of what the floor
 * and the queue do — and deliberately. A recognisable sample floor helps a
 * waiter mid-service; a sample *shelf* would have somebody writing off five
 * kilos of a fixture, and a sample *round* would have a rider handing back
 * somebody else's dinner. Where the fallback could be acted on, there is none.
 */
export const usePricedShelf = (lang: string): Live<readonly PricedShelfRow[]> =>
  useLive(() => pricedShelf(lang), [], `shelf:${lang}`);

export const useRiderRound = (): Live<readonly RiderDrop[]> => useLive(riderRound, [], 'round');

export const useCrewChecklist = (): Live<CrewChecklist> =>
  useLive(crewChecklist, { ticked: [], declaredTiyin: null }, 'checklist');

export const useSwapOptions = (lang: string): Live<SwapOptions> =>
  useLive(() => swapOptions(lang), { shifts: [], colleagues: [] }, `swap:${lang}`);

export const useCrewSuppliers = (): Live<readonly SupplierChoice[]> =>
  useLive(crewSuppliers, [], 'suppliers');

/** The stored session token, for screens that only need to know one exists. */
export const hasCrewSession = async (): Promise<boolean> => (await read(KEYS.crewSession)) !== null;
