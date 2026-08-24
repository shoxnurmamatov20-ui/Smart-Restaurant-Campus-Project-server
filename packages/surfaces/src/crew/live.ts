import { writtenAt, writtenClock } from '../time/written';

import {
  CURRENCY_WORD,
  MINUTE_WORD,
  ZONES,
  type Alert,
  type Approval,
  type ApprovalKind,
  type BranchRow,
  type Call,
  type CallKind,
  type LeaderRow,
  type LineState,
  type MenuRow,
  type MyTable,
  type OrderLine,
  type PushTone,
  type TableState,
  type TodayBoard,
  type Trilingual,
  type ZoneChip,
} from './data';

/**
 * The staff app's live payloads, turned into what its screens draw.
 *
 * Moved here from `apps/web/src/app/(staff)/crew-server.ts`, where the fetch
 * still lives. The mapping is the part that is dangerous to have twice — the
 * other waiter's totals, or a refund approved as a discount — and the phone
 * reads the same three endpoints (`tables/tables`, `orders/orders`,
 * `pos/approvals`) through its own client. Both now call `floorFrom()` and
 * `queueFrom()` from here; the transport differs, the reading does not.
 *
 * Pure by the package's rule: `now` is a parameter, so a test asserts a minute
 * and not "roughly", and nothing here knows what a cookie is.
 */

export type ApiTable = {
  id: number;
  label: string;
  seats: number;
  status: string;
  is_active: boolean;
  hall: { id: number } | null;
};

export type ApiHall = { id: number; name: Record<string, string> | string };

export type ApiOrder = {
  id: number;
  status: string;
  is_open: boolean;
  table: { id: number | null; label: string | null };
  guests_count: number;
  total: number;
  placed_at: string | null;
};

/**
 * The API's table states against the four this app draws.
 *
 * Anything unrecognised reads as free rather than throwing: a state the server
 * grows should leave the grid drawable, and a wrong tile is corrected by the
 * next load. Note there are four here and five on the console's floor plan —
 * a waiter has no use for `cleaning`, which is a runner's business.
 */
const TABLE_STATE: Readonly<Record<string, TableState>> = {
  free: 'free',
  available: 'free',
  cleaning: 'free',
  dirty: 'free',
  seated: 'occupied',
  occupied: 'occupied',
  reserved: 'reserved',
  booked: 'reserved',
  to_pay: 'awaiting-payment',
  billed: 'awaiting-payment',
};

/** Minutes since a party sat. Zero when nothing says when they did. */
function minutesSince(iso: string | null, now: number): number {
  if (iso === null) return 0;

  const then = Date.parse(iso);

  if (Number.isNaN(then)) return 0;

  return Math.max(0, Math.round((now - then) / 60_000));
}

function label(value: Record<string, string> | string, lang: string): string {
  if (typeof value === 'string') return value;

  return value[lang] ?? value.uz ?? value.ru ?? value.en ?? '';
}

export type WaiterFloor = {
  tables: readonly MyTable[];
  /** The rooms this restaurant actually has, for the filter chips. */
  zones: readonly ZoneChip[];
  /** False when these are fixtures — the screen says so rather than pretending. */
  live: boolean;
};

/**
 * The tables this waiter is looking after, with what each one owes.
 *
 * Two calls joined, because the two facts live apart: a table row knows its
 * number, its seats and its room; the open order on it knows the running total,
 * the covers and when the party sat. The console's own floor screen leaves a
 * TODO saying exactly this — it draws the table and not the bill — and a
 * waiter's screen is the one that cannot: "which of my tables wants something"
 * is answered by the order, not the furniture.
 *
 * **My tables, not the floor.** Filtered by `waiter_user_id` server-side rather
 * than here: a phone that downloaded every open order in the building and hid
 * the others would be one `view-source` away from another section's totals.
 */
/**
 * The floor, from three payloads and a clock.
 *
 * Pure, exported, and tested directly. The fetch above it is plumbing — three
 * URLs and a token — while this is the part that decides which tables a waiter
 * is shown and what each one owes, and that is the part worth pinning: a wrong
 * join here shows somebody another section's totals, or hides a table with four
 * people sitting at it.
 *
 * `now` is a parameter rather than a call so a test can pin the clock. A
 * function that read `Date.now()` itself could only be tested against
 * "roughly", which is not a thing to assert about how long a party has been
 * waiting.
 */
export function floorFrom(
  tables: readonly ApiTable[],
  halls: readonly ApiHall[],
  orders: readonly ApiOrder[],
  lang: string,
  now: number,
): WaiterFloor {
  /*
   * The open order on each table, by table id.
   *
   * A table legitimately carries several bills — `BILLS_PER_TABLE` is four —
   * and this keeps the earliest, because "how long has this party been sitting"
   * is a question about the party rather than about the newest cheque.
   */
  const openOn = new Map<number, ApiOrder>();

  for (const order of orders) {
    const tableId = order.table.id;

    if (tableId === null) continue;

    const held = openOn.get(tableId);

    if (held === undefined || (order.placed_at ?? '') < (held.placed_at ?? '')) {
      openOn.set(tableId, order);
    }
  }

  const rooms = new Map(halls.map((hall) => [hall.id, label(hall.name, lang)]));

  const mine = tables
    .filter((table) => table.is_active && openOn.has(table.id))
    .map((table): MyTable => {
      const order = openOn.get(table.id);
      const state = TABLE_STATE[table.status] ?? 'occupied';

      return {
        id: String(table.id),
        /*
         * The bill, beside the furniture.
         *
         * Every control on the table detail is about the order rather than the
         * table — reprinting a cheque, asking for a discount on it, splitting
         * it — and a screen that only knew the table id had to guess. `openOn`
         * has already picked the earliest open bill, which is the party that is
         * actually sitting there.
         */
        ...(order === undefined ? {} : { orderId: order.id }),
        number: table.label,
        /*
         * The hall's id as the key, its own name as the chip.
         *
         * Not one of three fixed words. A restaurant names its rooms whatever
         * it likes, and a screen that iterated a fixed list would silently drop
         * the fourth one — the same lesson the console's floor screen already
         * learned about halls.
         */
        zone: table.hall === null ? 'all' : String(table.hall.id),
        seats: table.seats,
        /*
         * The order outranks the table row.
         *
         * A table whose status still says `free` while an open order sits on it
         * is a table somebody sat without touching the floor plan, which is
         * ordinary during service. The bill is the fact.
         */
        state: order !== undefined && state === 'free' ? 'occupied' : state,
        total: order?.total ?? 0,
        minutes: minutesSince(order?.placed_at ?? null, now),
        bookedBy: '',
        bookedAt: '',
      };
    });

  /*
   * Only the rooms this waiter actually has tables in.
   *
   * A chip for an empty room is a filter that answers "nothing" — worse than
   * absent on a screen with three chips' worth of width.
   */
  const used = [...new Set(mine.map((table) => table.zone))];

  return {
    tables: mine,
    zones: [
      ZONES[0] as ZoneChip,
      ...used.map((key): ZoneChip => {
        const name = rooms.get(Number(key)) ?? key;

        return { key, label: { uz: name, ru: name, en: name } };
      }),
    ],
    live: true,
  };
}

export type ApiApproval = {
  id: number;
  action: string;
  amount: number | null;
  reason: string | null;
  status: string;
  requested_by?: { id: number | null; name: string | null } | null;
  requested_at: string | null;
};

export type ApprovalQueue = {
  items: readonly Approval[];
  live: boolean;
};

/**
 * The six things a till can ask for, against the three a manager is shown.
 *
 * Collapsed deliberately. A manager answering from a phone is deciding one
 * question — is this person allowed to take this much off the bill — and the
 * difference between voiding a line and voiding the whole order is detail that
 * belongs on the card, not in the heading. `comp` sits with the voids because
 * it is the same act with a nicer name: food that left the kitchen and was
 * never paid for.
 */
const APPROVAL_KIND: Readonly<Record<string, ApprovalKind>> = {
  discount: 'discount',
  void_line: 'void',
  void_order: 'void',
  comp: 'void',
  refund: 'refund',
  reopen_bill: 'refund',
};

/** `12 daq` / `12 мин` / `12 min`, built from the word this app already has. */
function agoIn(minutes: number): Trilingual {
  return {
    uz: `${minutes} ${MINUTE_WORD.uz}`,
    ru: `${minutes} ${MINUTE_WORD.ru}`,
    en: `${minutes} ${MINUTE_WORD.en}`,
  };
}

/** A whole-so'm figure with its unit, in all three. Data, not copy. */
function moneyIn(tiyin: number): Trilingual {
  const whole = Math.round(tiyin / 100);
  const figure = whole.toLocaleString('ru-RU').replace(/[,\s]/g, ' ');

  return {
    uz: `${figure} ${CURRENCY_WORD.uz}`,
    ru: `${figure} ${CURRENCY_WORD.ru}`,
    en: `${figure} ${CURRENCY_WORD.en}`,
  };
}

/**
 * The POS approvals waiting on this manager, oldest first.
 *
 * The design's sharpest use of the staff app: a manager signs off an eight
 * million so'm void from wherever they are standing, instead of walking to the
 * till while a guest waits with their card out.
 * `GET /api/v1/pos/approvals` already answers this — nothing about the request
 * is app-specific, which is why there is no new endpoint here.
 *
 * An empty queue and a dead API are told apart. Both draw no cards, and only
 * one of them means "nothing to do": a manager who thinks their queue is clear
 * because the server timed out is a table that never gets its discount. `live`
 * is what the panel uses to say which happened.
 */
/**
 * The queue, from one payload and a clock.
 *
 * Pure and exported for the same reason `floorFrom` is: the collapse from six
 * till actions to three headings, and the shape a card is drawn from, are the
 * parts that can be wrong in a way nobody notices — a refund rendered as a
 * discount is a manager approving the wrong thing.
 */
export function queueFrom(approvals: readonly ApiApproval[], now: number): readonly Approval[] {
  return approvals.map((approval): Approval => {
    const minutes = minutesSince(approval.requested_at, now);
    const amount = approval.amount ?? 0;

    return {
      id: String(approval.id),
      kind: APPROVAL_KIND[approval.action] ?? 'void',
      amount: moneyIn(amount),
      requester: approval.requested_by?.name ?? '',
      /*
       * The verb, so the card says which of the three voids this is.
       *
       * Untranslated on purpose: `void_line` is a contract value the API and
       * this file both name, and inventing three sentences for six actions
       * would be a second catalogue that drifts from the first one to change.
       */
      detail: { uz: approval.action, ru: approval.action, en: approval.action },
      reason: {
        uz: approval.reason ?? '',
        ru: approval.reason ?? '',
        en: approval.reason ?? '',
      },
      ago: agoIn(minutes),
    };
  });
}

/* ============================================================
   My own day — `GET /api/v1/staff/me/today`

   The one endpoint in the staff app that is about the person holding the
   phone rather than about the restaurant. It carries no personnel data beyond
   their own, which is why it needs no permission and why this mapping is
   deliberately small: a screen that could show somebody else's hours would be
   a screen a waiter could read their manager's pay off.
   ============================================================ */

export type ApiMyDay = {
  business_date: string;
  member: { id: number; full_name: string; position: string } | null;
  shifts: readonly { starts_at: string; ends_at: string; role: string | null }[];
  clocked_in: boolean;
  clocked_in_at: string | null;
  minutes_worked: number;
  is_late: boolean;
  next_shift: { starts_at: string; ends_at: string; role: string | null } | null;
};

export type MyDay = {
  /** `10:00 – 19:00`, or null for somebody not rostered today. */
  rostered: string | null;
  clockedIn: boolean;
  /** `09:58`, or null when they have not clocked in. */
  clockedInAt: string | null;
  /** `6:20` — hours and minutes, not a decimal. A shift is not 6.33 hours. */
  worked: string;
  workedMinutes: number;
  late: boolean;
  /** The next one after today: `Se 10:00`, or null when nothing is published. */
  next: string | null;
  live: boolean;
};

/** The two digits of the hour and the two of the minute, as the venue wrote them. */
const clockOf = (iso: string): string => writtenClock(iso);

/**
 * Hours and minutes, never a decimal.
 *
 * "6.33" is a payroll figure and this is not payroll — it is a person checking
 * how long they have been standing up. `6:20` is the answer they can act on.
 */
function hoursAndMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));

  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * A weekday abbreviation, from the reader's own locale.
 *
 * Two letters, because the next shift is a reminder rather than a diary entry —
 * "Tu 10:00" is what somebody needs to plan an evening, and the full word would
 * push the line past the edge of a phone.
 */
function shortDay(iso: string, lang: string): string {
  const at = writtenAt(iso);

  if (at === null) return '';

  return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(at);
}

/**
 * The person's own day, from the API's answer.
 *
 * No clock is read here, and that is deliberate — unlike `floorFrom` and
 * `queueFrom` above, which take `now` because they turn timestamps into "12
 * minutes ago". Every figure on this screen is already a figure: the server
 * counts the closed attendance records at their frozen minutes and the open one
 * up to its own clock, and a phone that redid that sum would disagree with the
 * payslip by however far its own clock has drifted. A handset's clock is the
 * least trustworthy one in the building.
 *
 * So the minutes move when the screen asks again, not when it re-renders.
 */
export function myDayFrom(day: ApiMyDay, lang: string): MyDay {
  const first = day.shifts[0];

  return {
    rostered:
      first === undefined ? null : `${clockOf(first.starts_at)} – ${clockOf(first.ends_at)}`,
    clockedIn: day.clocked_in,
    clockedInAt: day.clocked_in_at === null ? null : clockOf(day.clocked_in_at),
    worked: hoursAndMinutes(day.minutes_worked),
    workedMinutes: day.minutes_worked,
    late: day.is_late,
    next:
      day.next_shift === null
        ? null
        : `${shortDay(day.next_shift.starts_at, lang)} ${clockOf(day.next_shift.starts_at)}`.trim(),
    live: true,
  };
}

/* ============================================================
   The storekeeper's two lists

   Both used to be fixtures with word ids, and that was the thing standing
   between the store screens and the server: `POST /api/v1/staff/actions` keys
   `count_submit` on `ingredient_id` and `receive_confirm` on
   `purchase_order_id`, so a screen holding `c1` and `v3` had nothing to send.
   These mappings are what turn the two lists into rows that carry the
   restaurant's own ids, which is the whole difference between a button that
   records and a button that reports.

   Here rather than in `crew-server.ts` for the reason `floorFrom` gives: the
   phone reads the same two endpoints through its own client, and a second
   reading of "days of cover" is how two devices come to disagree about which
   shelf is about to run out.
   ============================================================ */

/** `GET /api/v1/inventory/ingredients` — one row of the shelf. */
export type ApiIngredient = {
  id: number;
  name: Record<string, string> | string;
  unit: string;
  stock_quantity: number;
  min_quantity: number;
  is_low?: boolean;
  /**
   * What one base unit costs, tiyin — `IngredientResource.price_tiyin`.
   *
   * Only the waste and reorder sheets read it. The count sheet must not: a
   * storekeeper who can see what a shelf is worth while counting it is a
   * storekeeper counting towards a number.
   */
  price_tiyin?: number;
};

/** What the count and stock screens draw, with a real id on every row. */
export type ShelfRow = {
  id: string;
  name: Trilingual;
  unit: Trilingual;
  /** What is on the shelf, with its unit. A measurement, not a translation. */
  onHand: string;
  /** Days of cover at the current rate. Red under 1.5, amber under 3. */
  days: number;
};

/**
 * A unit word in three languages.
 *
 * The column holds one token — `kg`, `l`, `pcs` — and two of the three read the
 * same in every language a restaurant here uses. Only the counted noun differs,
 * so only that one is translated; inventing Russian for `kg` would be inventing
 * a difference the label does not have.
 */
function unitWord(unit: string): Trilingual {
  const token = unit.trim().toLowerCase();

  if (token === 'pcs' || token === 'pc' || token === 'dona' || token === 'sht') {
    return { uz: 'dona', ru: 'шт', en: 'pcs' };
  }

  return { uz: token, ru: token, en: token };
}

/**
 * Days of cover, from the two numbers the column actually holds.
 *
 * `min_quantity` is the level a restaurant reorders at, and it is set as *about
 * a day's use* — that is what a minimum on a perishable means. So the ratio of
 * stock to minimum is a serviceable cover figure and it is the only one
 * available without a consumption history, which this endpoint does not carry.
 *
 * A minimum of zero means nobody set one. That answers "no idea" rather than
 * "infinite cover", and the screen's own thresholds would paint an unset row
 * green — so it is reported as a comfortable number rather than a reassuring
 * one, and the row simply does not raise an alarm it has no basis for.
 */
function coverDays(stock: number, minimum: number): number {
  if (minimum <= 0) return 99;

  return Math.round((stock / minimum) * 10) / 10;
}

/**
 * How much is there, in the unit the shelf is counted in.
 *
 * The column is in base units — grams for a meat, millilitres for an oil — and
 * a storekeeper counts kilograms and litres. Dividing by a thousand where the
 * base unit says so is the same conversion the console's inventory table does;
 * printing `45000 g` at somebody about to count a shelf is how a count comes
 * back wrong by a factor of a thousand.
 */
function onHandLabel(quantity: number, unit: string): string {
  const token = unit.trim().toLowerCase();

  if (token === 'g') return `${Math.round(quantity / 100) / 10} kg`;
  if (token === 'ml') return `${Math.round(quantity / 100) / 10} l`;

  return `${quantity} ${token}`;
}

export function shelfFrom(items: readonly ApiIngredient[], lang: string): readonly ShelfRow[] {
  return items.map((item): ShelfRow => {
    const name = label(item.name, lang);

    return {
      id: String(item.id),
      // One language repeated rather than a fabricated translation: the API has
      // already resolved the column for the reader's own `X-Locale`, and a
      // second reading here would answer a different question.
      name: { uz: name, ru: name, en: name },
      unit: unitWord(item.unit),
      onHand: onHandLabel(item.stock_quantity, item.unit),
      days: coverDays(item.stock_quantity, item.min_quantity),
    };
  });
}

/** `GET /api/v1/suppliers/purchase-orders` — one van. */
export type ApiPurchaseOrder = {
  id: number;
  number: string;
  status: string;
  expected_at: string | null;
  total: number;
  supplier?: { id: number; name: string } | null;
  items?: readonly unknown[];
};

/** A delivery card, carrying the purchase order id `receive_confirm` needs. */
export type CrewDelivery = {
  id: string;
  supplier: string;
  amount: number;
  lines: number;
  status: 'en-route' | 'arrived' | 'tomorrow';
  note: Trilingual;
};

/**
 * Which of the three chips a purchase order wears.
 *
 * Read off the expected date rather than off the status alone, because the
 * status says what the paperwork is and the chip says what the storekeeper
 * should do about it this morning. An order still `sent` and expected tomorrow
 * is not the same job as one expected in an hour, and the design's own rule —
 * tomorrow's van gets no receive button — turns on exactly that difference.
 */
function deliveryChip(
  status: string,
  expectedAt: string | null,
  now: number,
): CrewDelivery['status'] {
  if (status === 'received' || status === 'partial') return 'arrived';

  if (expectedAt === null) return 'en-route';

  const expected = Date.parse(expectedAt);

  if (Number.isNaN(expected)) return 'en-route';

  // Anything past the end of today is a job for tomorrow, and booking stock
  // nobody has seen is the one mistake this screen can make that costs money.
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return expected > endOfToday.getTime() ? 'tomorrow' : 'en-route';
}

export function deliveriesFrom(
  orders: readonly ApiPurchaseOrder[],
  now: number,
): readonly CrewDelivery[] {
  return orders.map((order): CrewDelivery => {
    const when = order.expected_at === null ? '' : clockOf(order.expected_at);
    const number = order.number;

    return {
      id: String(order.id),
      // A supplier trades under one name in every language.
      supplier: order.supplier?.name ?? number,
      amount: order.total,
      lines: order.items?.length ?? 0,
      status: deliveryChip(order.status, order.expected_at, now),
      /*
       * The document number and the hour, which are the two things a
       * storekeeper checks against the paper in their hand. Composed rather
       * than translated: both halves are data, and a sentence assembled out of
       * catalogue keys reads like one in exactly one of the three languages.
       */
      note: {
        uz: when === '' ? number : `${number} · ${when}`,
        ru: when === '' ? number : `${number} · ${when}`,
        en: when === '' ? number : `${number} · ${when}`,
      },
    };
  });
}

/**
 * A row's database id, or null when the screen is drawing a fixture.
 *
 * Every write this app makes names a row by number, and a fixture's id is a
 * word. Posting one would be answered `payload_incomplete` and the person would
 * be told their work did not land — when in truth it was never theirs to send.
 * So a screen asks this first and queues the entry without a verb instead.
 */
export function realId(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

/* ============================================================
   The owner's venues, ranked
   ============================================================ */

/** `GET /api/v1/analytics/branches` — one venue's window, as the report sends it. */
export type ApiBranchRow = {
  branch_id: number;
  name: string;
  city?: string | null;
  revenue_tiyin: number;
  /** The window's slice of the monthly target, already divided by the server. */
  target_tiyin?: number | null;
  orders_count?: number | null;
  margin_percent?: number | null;
  staff_count?: number | null;
  delta_percent?: number | null;
};

/**
 * The branch cards, from the report the console's own Branches screen reads.
 *
 * One endpoint rather than three, and that is the point: revenue from the
 * dashboard, a target from `/branches` and a head count from `/staff/members`
 * would be three reads that can disagree about which venues exist, and the
 * phone would draw the disagreement as a missing card.
 *
 * `target_tiyin` is sliced server-side. A phone dividing a monthly figure by
 * thirty would be a third place holding that rule, and the attainment bar —
 * the whole argument of this screen — is exactly where a quiet disagreement
 * would go unnoticed: the bar would simply be a little short.
 */
export function branchesFrom(rows: readonly ApiBranchRow[]): readonly BranchRow[] {
  return rows.map((row) => {
    const delta = row.delta_percent ?? null;
    const margin = row.margin_percent ?? null;

    return {
      id: String(row.branch_id),
      name: row.name,
      city: (row.city ?? '').trim(),
      revenue: row.revenue_tiyin,
      target: row.target_tiyin ?? 0,
      delta: signed(delta),
      /* A venue with no comparison is drawn as neither up nor down. Defaulting
         to `up` would paint every first-day branch green. */
      up: (delta ?? 0) >= 0,
      orders: row.orders_count ?? 0,
      /* An em dash, not "0%". A margin of zero is a venue selling at cost; an
         unknown margin is a menu nobody has costed yet, and the two must not
         read the same on a card somebody makes a decision from. */
      margin: margin === null ? '—' : `${margin.toFixed(1)}%`,
      staff: row.staff_count ?? 0,
    };
  });
}

/* ============================================================
   What the restaurant wants somebody to know
   ============================================================ */

/** `GET /api/v1/notifications` — one row of the tray. */
export type ApiNotification = {
  id: number;
  level?: string | null;
  /** The row's own sentence, when it wrote one. */
  title?: string | null;
  body?: string | null;
  /** The venue it happened at; null is the whole business. */
  place?: string | null;
  at?: string | null;
  read_at?: string | null;
};

/**
 * The tray's three levels to the four tones this surface draws.
 *
 * `low` becomes `quiet` rather than `brand`: the phone's list is read at a
 * glance and a blue dot beside a red one says "also urgent". Anything the API
 * sends that is not one of the three is drawn as a fact rather than dropped —
 * the row is still something somebody needs to see, and losing it is a bigger
 * mistake than painting it the wrong colour.
 */
const ALERT_TONE: Readonly<Record<string, PushTone | 'quiet'>> = {
  high: 'danger',
  mid: 'warning',
  low: 'quiet',
};

/**
 * The alerts, from the tray the console already reads.
 *
 * No second endpoint and no crew-specific feed: what an owner needs to know
 * about a cash variance is the same fact whether they read it at the desk or on
 * the way home, and two sources would be two lists able to disagree about
 * whether it had been dealt with.
 *
 * The venue's name joins the body rather than the title. A title is what the
 * thing IS — "Kassa farqi 32 000 so'm" — and the design puts where and when
 * underneath it; a title carrying the branch reads as a different event per
 * branch, which is exactly what a person scanning five of them must not think.
 */
export function alertsFrom(
  rows: readonly ApiNotification[],
  now: number,
  words: { minutesAgo: (minutes: number) => Trilingual },
): readonly Alert[] {
  return rows.map((row) => {
    const at = row.at === null || row.at === undefined ? null : Date.parse(row.at);
    const minutes =
      at === null || Number.isNaN(at) ? 0 : Math.max(0, Math.round((now - at) / 60_000));

    const title = (row.title ?? '').trim();
    const body = (row.body ?? '').trim();
    const place = (row.place ?? '').trim();

    return {
      id: String(row.id),
      tone: ALERT_TONE[row.level ?? ''] ?? 'quiet',
      title: asIs(title),
      /* Place and sentence, joined only when both are there — a lone middle dot
         is what an empty half of this line used to render as. */
      body: asIs([place, body].filter((part) => part !== '').join(' · ')),
      ago: words.minutesAgo(minutes),
    };
  });
}

/* ============================================================
   The menu a waiter orders from
   ============================================================ */

/** `GET /api/v1/menu/items` — one dish, as the console's own reader sees it. */
export type ApiMenuItem = {
  id: number;
  title?: string | null;
  name?: Record<string, string> | string | null;
  price: number;
  is_orderable?: boolean;
  is_available?: boolean;
  category?: { title?: string | null } | null;
};

/**
 * The dishes, with the ids an order line has to carry.
 *
 * `MENU_ROWS` is the design's own six-item card and it has word ids, so an
 * order taken against it had nothing to send: `POST orders/{order}/items` names
 * a dish by number and prices it from the Menu at that moment, which is the one
 * rule that keeps a guest from being charged tomorrow's price for tonight's
 * plate.
 *
 * A dish the kitchen has 86'd comes down flagged rather than dropped, because
 * the screen dims it and says so in words — a dish that silently disappeared
 * leaves a waiter looking for it while a guest waits.
 */
export function menuFrom(items: readonly ApiMenuItem[], lang: string): readonly MenuRow[] {
  return items.map((item): MenuRow => {
    const name = item.title ?? label(item.name ?? '', lang);
    const section = item.category?.title ?? '';

    return {
      id: String(item.id),
      // The API resolved both columns against this request's `X-Locale`, so
      // re-reading the map here would answer a different question — what this
      // client thinks the language is rather than what the server was asked.
      name: { uz: name, ru: name, en: name },
      category: { uz: section, ru: section, en: section },
      price: item.price,
      soldOut: item.is_orderable === false || item.is_available === false,
    };
  });
}

/* ============================================================
   The dock's search — two things this app can genuinely find
   ============================================================ */

/**
 * A table the search box turned up.
 *
 * Deliberately not `MyTable`. That type carries a running total, a seated-since
 * clock and the id of the open bill, all of which come from joining the floor to
 * the order list — a join this screen has no business making. Somebody typing
 * "a1" wants to know *where A-12 is and whether anyone is sitting at it*, and
 * answering that with a second, heavier read would make the search box the
 * slowest control in the app.
 */
export type FoundTable = {
  id: string;
  /** The number painted on it: "A-12". A label, never arithmetic. */
  label: string;
  /**
   * The room, in the reader's own language.
   *
   * The hall's *name* rather than its id, unlike `floorFrom` — there are no
   * filter chips here to key off an id, and a result reading "3" would be worse
   * than no room at all.
   */
  zone: string;
  /** `free` · `occupied` · `booked` — the vocabulary the floor already draws. */
  state: TableState;
  seats: number;
};

/**
 * Tables, from the label search and the hall list.
 *
 * Inactive tables are dropped. A table taken out of service is furniture in a
 * store room; offering it as a result would send a waiter to a corner of the
 * restaurant where there is no table any more.
 */
export function foundTablesFrom(
  tables: readonly ApiTable[],
  halls: readonly ApiHall[],
  lang: string,
): readonly FoundTable[] {
  const rooms = new Map(halls.map((hall) => [hall.id, label(hall.name, lang)]));

  return tables
    .filter((table) => table.is_active)
    .map((table): FoundTable => ({
      id: String(table.id),
      label: table.label,
      zone: table.hall === null ? '' : (rooms.get(table.hall.id) ?? ''),
      /*
       * No order to overrule the row, so the row is taken at its word — the
       * opposite of `floorFrom`, and on purpose. There the bill is the fact
       * because a waiter is looking at their own section; here there is no bill
       * in hand, and inventing "occupied" from a missing read would be a guess
       * printed as a state.
       */
      state: TABLE_STATE[table.status] ?? 'occupied',
      seats: table.seats,
    }));
}

/* ============================================================
   One table, and what is on it
   ============================================================ */

/** `GET /api/v1/orders/orders/{order}` — the show call already loads its lines. */
export type ApiOrderItem = {
  id: number;
  title: string;
  quantity: number;
  unit_price: number;
  status: string;
};

/**
 * The five states a line can be in against the three this screen draws.
 *
 * `pending` reads as cooking, because to a waiter standing at the table the two
 * are one fact — the plate is not here yet — and a fourth word on the row would
 * be a distinction only the kitchen acts on. `cancelled` is dropped by the
 * caller rather than mapped: a line that was voided is not on the bill, and
 * drawing it greyed would have a guest asking what they are being charged for.
 */
const LINE_STATE_OF: Readonly<Record<string, LineState>> = {
  pending: 'cooking',
  cooking: 'cooking',
  ready: 'ready',
  served: 'served',
};

export function tableLinesFrom(items: readonly ApiOrderItem[]): readonly OrderLine[] {
  return items
    .filter((item) => item.status !== 'cancelled')
    .map((item): OrderLine => {
      // The API resolved the title against this request's `X-Locale`; one
      // language in all three slots rather than a second reading of the column.
      const name = item.title;

      return {
        quantity: item.quantity,
        name: { uz: name, ru: name, en: name },
        price: item.unit_price,
        state: LINE_STATE_OF[item.status] ?? 'cooking',
      };
    });
}

/* ============================================================
   The owner's and the manager's home tab

   `TodayPanel` used to render `TODAY[role]` end to end — an eighteen-million
   trading day across five branches, with a delta, a sparkline and a leaderboard
   — and, unlike the two sibling panels on the same route, it carried no `live`
   flag and no label. So the first screen an owner opened in the staff app was a
   complete fabricated day presented as their own.

   `GET /api/v1/dashboard?role=owner|manager` already answers both shapes. This
   is the join, here rather than in `crew-server.ts` for the reason `floorFrom`
   gives: the phone reads the same endpoint through its own client, and a second
   reading of "today's revenue" is how two devices come to disagree about the
   only figure on the screen.
   ============================================================ */

/** One card of `GET /dashboard`'s KPI row. */
export type ApiDashKpi = {
  key: string;
  value: number | null;
  unit: string;
  delta_percent?: number | null;
  delta_label?: string | null;
};

/** The slice of `GET /dashboard` this tab reads. Everything else is ignored. */
export type ApiCrewDashboard = {
  kpis: readonly ApiDashKpi[];
  branches?: readonly {
    id: number;
    name: string;
    revenue_tiyin: number;
    delta_percent?: number | null;
  }[];
  waiters?: readonly { id: number; name: string; revenue_tiyin: number; orders?: number | null }[];
  hours?: readonly { hour: string; revenue_tiyin: number }[];
};

export type CrewToday = {
  board: TodayBoard;
  live: boolean;
};

/** Two letters for the round chip, from whatever the place or person is called. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '··';
}

/** A signed percentage as the chip prints it, or an em dash when unknown. */
function signed(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return '—';

  return `${percent >= 0 ? '+' : '−'}${Math.abs(percent).toFixed(1)}%`;
}

/**
 * The design's 300×74 sparkline, over whatever hours the day has so far.
 *
 * Scaled to the day's own peak rather than to a fixed ceiling: the card asks
 * "is today shaped like a normal day", and a curve flattened against somebody
 * else's maximum answers nothing. An empty or flat day draws a flat line, which
 * is the truthful picture of a flat day.
 */
export function sparkOf(hours: readonly { revenue_tiyin: number }[]): string {
  if (hours.length < 2) return '';

  const peak = Math.max(...hours.map((point) => point.revenue_tiyin), 1);

  return hours
    .map((point, index) => {
      const x = Math.round((index / (hours.length - 1)) * 300);
      const y = Math.round(74 - (point.revenue_tiyin / peak) * 68);

      return `${x},${y}`;
    })
    .join(' ');
}

/** The same string in all three slots — a proper noun has one spelling. */
const asIs = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

/**
 * Today, from the dashboard endpoint.
 *
 * `place` is what the figures are about — the pinned venue, or the restaurant
 * for somebody reading the whole business — and it replaces the fixture's
 * "5 filial", which was a branch count belonging to the demo.
 *
 * Every KPI card is taken from the payload and nothing is invented: a figure
 * the endpoint did not send is dropped rather than filled in, because a
 * fixture number beside five live ones is the one thing a reader cannot see.
 */
export function todayFrom(
  api: ApiCrewDashboard,
  labels: {
    revenueLabel: string;
    revenueNote: string;
    listLabel: string;
    kpi: (key: string) => string;
  },
  role: 'owner' | 'manager',
): TodayBoard {
  const kpi = (key: string) => api.kpis.find((row) => row.key === key);
  const revenue = kpi('revenue');

  const rows: readonly LeaderRow[] =
    role === 'owner'
      ? (api.branches ?? []).map((branch) => ({
          name: branch.name,
          initials: initialsOf(branch.name),
          revenue: branch.revenue_tiyin,
          note: asIs(signed(branch.delta_percent)),
        }))
      : (api.waiters ?? []).map((waiter) => ({
          name: waiter.name,
          initials: initialsOf(waiter.name),
          revenue: waiter.revenue_tiyin,
          note: asIs(
            waiter.orders === null || waiter.orders === undefined ? '—' : String(waiter.orders),
          ),
        }));

  return {
    revenueLabel: asIs(labels.revenueLabel),
    revenue: revenue?.value ?? 0,
    delta: signed(revenue?.delta_percent),
    revenueNote: asIs(labels.revenueNote),
    spark: sparkOf(api.hours ?? []),
    /*
     * Only the cards the payload carries, in the order the design lists them.
     * `delta` is the server's own sentence where it sent one; an em dash where
     * it did not, because "no comparison" is a real answer and `+0.0%` is not.
     */
    kpis: api.kpis
      .filter((row) => row.key !== 'revenue' && row.value !== null)
      .map((row) => ({
        label: asIs(labels.kpi(row.key)),
        value:
          row.unit === 'money'
            ? asIs(new Intl.NumberFormat('uz-UZ').format(Math.round((row.value ?? 0) / 100)))
            : String(row.value ?? 0),
        delta: asIs(row.delta_label ?? signed(row.delta_percent)),
        tone:
          row.delta_percent === null || row.delta_percent === undefined
            ? ('flat' as const)
            : row.delta_percent >= 0
              ? ('up' as const)
              : ('down' as const),
      })),
    listLabel: asIs(labels.listLabel),
    list: rows,
  };
}

/* ============================================================
   The waiter's call queue

   `tables.waiter_calls` is written by the QR screen's two buttons and read by
   `GET /api/v1/tables/calls`. The crew panel drew `CALLS` — three sample cards
   — and its "done" button set a local flag: two waiters could both clear the
   same call, the kitchen kept chasing it, and it came back on the next reload.
   ============================================================ */

/** `GET /api/v1/tables/calls`, narrowed to what the card draws. */
export type ApiWaiterCall = {
  id: number;
  kind: string;
  status: string;
  table: { id: number; label: string | null };
  seat_no: number | null;
  note: string | null;
  /** The server owns "how long" because it owns the moment it started. */
  waiting_minutes: number;
};

/**
 * The three kinds the panel colours by, against whatever the column holds.
 *
 * Written out rather than cast: a fourth kind added on the server would
 * otherwise land as `ready` and put a plate-going-cold edge on a bill request.
 */
const CALL_KIND: Readonly<Record<string, CallKind>> = {
  ready: 'ready',
  waiter: 'guest',
  guest: 'guest',
  bill: 'bill',
};

export function callsFrom(
  rows: readonly ApiWaiterCall[],
  words: {
    table: string;
    /** One title and one action per kind, already in the reader's language. */
    title: Readonly<Record<CallKind, string>>;
    body: Readonly<Record<CallKind, string>>;
    action: Readonly<Record<CallKind, string>>;
    seat: string;
  },
): readonly Call[] {
  return rows.map((row) => {
    const kind = CALL_KIND[row.kind] ?? 'guest';
    const where = `${words.table} ${row.table.label ?? row.table.id}`;

    /*
     * The guest's own words win over the canned sentence. A note typed at the
     * table is the reason the call exists; a seat number is the next best
     * thing, and the canned line is what is left when there is neither.
     */
    const body =
      row.note !== null && row.note.trim() !== ''
        ? row.note.trim()
        : row.seat_no === null
          ? words.body[kind]
          : `${words.seat} ${row.seat_no}`;

    return {
      id: String(row.id),
      kind,
      title: asIs(`${where} · ${words.title[kind]}`),
      body: asIs(body),
      // Minutes are what the server counts, so the card says minutes rather
      // than a `m:ss` it would have to invent the seconds for.
      waiting: `${row.waiting_minutes}:00`,
      action: asIs(words.action[kind]),
    };
  });
}

/* ============================================================
   The two sheets that price a line: waste and reorder
   ============================================================ */

/**
 * A shelf row with a price on it.
 *
 * The waste sheet and the reorder sheet are the same list read two ways — what
 * was thrown away, and what has to be bought — and both need three things the
 * count sheet deliberately does without: an id to post, a name to read, and a
 * unit price so the running total on screen is the money the entry represents.
 *
 * `MORE_WASTE_ITEMS` and `MORE_PURCHASE` are the fixture shape of this, and
 * they are why the forms could not post: `w1`…`w5` are words, and `waste_log`
 * is keyed on `ingredient_id`.
 */
export type PricedShelfRow = {
  /** The database id as a string, so `realId()` decides whether it can be sent. */
  id: string;
  name: Trilingual;
  unit: Trilingual;
  /** Tiyin per base unit. Zero when the store has never costed the row. */
  unitTiyin: number;
  /** What is on the shelf, with its unit — the reorder sheet's "you have" line. */
  onHand: string;
  /** How many to suggest ordering: enough to reach the minimum, else none. */
  suggested: number;
};

/**
 * The shelf, priced, for the two forms that spend money.
 *
 * The suggestion is the gap to the minimum and nothing cleverer. A reorder
 * quantity derived from a consumption forecast would be a better number and a
 * worse one to show: a storekeeper adjusts what they can check against the
 * shelf in front of them, and a figure they cannot reconstruct is a figure they
 * either accept blindly or ignore entirely.
 */
export function pricedShelfFrom(
  items: readonly ApiIngredient[],
  lang: string,
): readonly PricedShelfRow[] {
  return items.map((item): PricedShelfRow => {
    const name = label(item.name, lang);
    const short = Math.max(0, item.min_quantity - item.stock_quantity);

    return {
      id: String(item.id),
      // One language repeated rather than a fabricated translation — the API
      // already resolved the column against this request's own locale.
      name: { uz: name, ru: name, en: name },
      unit: unitWord(item.unit),
      unitTiyin: Math.max(0, Math.round(item.price_tiyin ?? 0)),
      onHand: onHandLabel(item.stock_quantity, item.unit),
      suggested: short,
    };
  });
}

/** `GET /api/v1/suppliers/suppliers` — who a reorder can be addressed to. */
export type ApiSupplier = { id: number; name: string; is_active?: boolean };

export type SupplierChoice = { id: string; name: string };

/**
 * The suppliers a phone may raise an order with.
 *
 * Inactive ones are dropped rather than dimmed: a storekeeper picking from a
 * list on a phone at a service entrance does not need to be shown a company the
 * restaurant stopped buying from, and a greyed row is a row somebody taps.
 */
export function suppliersFrom(rows: readonly ApiSupplier[]): readonly SupplierChoice[] {
  return rows
    .filter((row) => row.is_active !== false)
    .map((row) => ({ id: String(row.id), name: row.name }));
}

/* ============================================================
   The swap form: which shift, and which colleague
   ============================================================ */

/** `GET /api/v1/staff/me/upcoming`. */
export type ApiUpcoming = {
  shifts: readonly { id: number; starts_at: string; ends_at: string; role?: string | null }[];
  colleagues: readonly { id: number; full_name: string; position?: string | null }[];
};

export type SwapShiftChoice = {
  /** The staff.shifts id — what `POST /staff/shift-swaps` is keyed on. */
  id: string;
  /** "Payshanba, 14-avgust" in the reader's own language. */
  day: string;
  /** "18:00 – 02:00". */
  time: string;
};

export type SwapPersonChoice = {
  /** The staff_members id — what `offered_to_id` takes. */
  id: string;
  name: string;
  initials: string;
  /** Their job, which is how somebody decides who can actually cover a bar shift. */
  role: string;
};

export type SwapOptions = {
  shifts: readonly SwapShiftChoice[];
  colleagues: readonly SwapPersonChoice[];
};

/**
 * The swap form's two lists, from the caller's own upcoming rota.
 *
 * The design drew a weekday heading — "Payshanba" — and that is the defect this
 * mapper exists to end: a weekday names a different Thursday every week, so the
 * form could not say which shift it meant even to a human, let alone to
 * `shift_id`. Here the day carries a **date** beside the weekday for exactly
 * that reason.
 *
 * Formatted here rather than in the panel because the panel is a client
 * component and `Intl` disagrees with itself between Node and a browser —
 * "Sha" against "Shan" is a hydration mismatch that blanks the screen. Every
 * label on these two lists is composed on the server and handed down as a
 * string.
 */
export function swapOptionsFrom(answer: ApiUpcoming, lang: string): SwapOptions {
  const day = new Intl.DateTimeFormat(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return {
    shifts: answer.shifts.map((shift): SwapShiftChoice => {
      const starts = writtenAt(shift.starts_at);

      return {
        id: String(shift.id),
        day: starts === null ? '' : day.format(starts),
        time: `${clockOf(shift.starts_at)} – ${clockOf(shift.ends_at)}`,
      };
    }),
    colleagues: answer.colleagues.map((person): SwapPersonChoice => ({
      id: String(person.id),
      name: person.full_name,
      initials: initialsOf(person.full_name),
      role: person.position ?? '',
    })),
  };
}

/* ============================================================
   A rider's own round
   ============================================================ */

/** `GET /api/v1/orders/deliveries/mine` — one drop on this rider's list. */
export type ApiRiderDrop = {
  id: number;
  status: string;
  order: {
    id: number;
    number: string;
    address?: string | null;
    customer_name?: string | null;
    total_tiyin: number;
    collect_tiyin: number;
  } | null;
};

export type RiderDrop = {
  /** The ORDER id, not the delivery id — `delivery_status` is keyed on the bill. */
  id: string;
  number: string;
  where: string;
  /** What to ask for at the door, tiyin. Zero when the money already arrived. */
  collectTiyin: number;
  status: string;
};

/**
 * The rider's round, with the order id a hand-back has to carry.
 *
 * `delivery_status` takes `order_id` and the courier screens had none — the
 * drops list was the design's fixture, because `orders/deliveries` is the
 * dispatcher's board and `orders/orders` has no courier filter. `deliveries/mine`
 * is the third door and it is the right one: it answers about the caller, so a
 * rider cannot read another rider's evening.
 *
 * A row whose order did not come down is dropped. It cannot be handed back,
 * cannot be marked delivered and cannot be counted into the cash a courier
 * declares — drawing it would put a line on the screen that no button works on.
 */
export function roundFrom(rows: readonly ApiRiderDrop[]): readonly RiderDrop[] {
  const drops: RiderDrop[] = [];

  for (const row of rows) {
    if (row.order === null) continue;

    drops.push({
      id: String(row.order.id),
      number: row.order.number,
      where: row.order.address ?? row.order.customer_name ?? '',
      collectTiyin: Math.max(0, Math.round(row.order.collect_tiyin)),
      status: row.status,
    });
  }

  return drops;
}
