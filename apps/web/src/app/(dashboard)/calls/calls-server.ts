import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import {
  AUTOMATION_RULES,
  CALLS_COPY,
  CALLS_UI,
  COMPOSE_MENU,
  COURIERS,
  PEAK_TICKETS_DEFAULT,
  PREP_DEFAULT,
  QUEUE,
  TO_ASSIGN,
  type Assignment,
  type ChannelKey,
  type ComposeItem,
  type Courier,
  type QueueOrder,
  type Trilingual,
} from './calls-data';

/**
 * The intake screen, from the API.
 *
 * Server half of ./calls-data.ts. Three of the five tabs read live now — the
 * queue, the compose flow's catalogue, and the courier board — and the two that
 * do not are the aggregator integrations, which are contracts with Yandex, Uzum
 * and Wolt rather than code this repository is missing.
 *
 * The queue was the last one to become possible and the reason is one column.
 * `GET /api/v1/orders/orders` has always listed the right rows; what it could
 * not do is separate an order waiting to be accepted from a table's first
 * ticket, because `status` says `placed` for both. `intake_channel` — null on
 * everything that started in the room — is that separation, and
 * `filter[intake]=true` is the read built on it. `OrderResource` now publishes
 * the four things a card draws, too: before that every card would have been *a
 * number with four blanks under it*.
 *
 * A board that is real is worth having tab by tab — it is what an operator
 * refreshes while somebody is on the line asking where their food is — and the
 * shell's `live` banner already distinguishes a live console from the demo one.
 *
 * ---------------------------------------------------------------------------
 * The three states the server can answer, and the fourth it cannot
 *
 * `CourierState` names four: `waiting`, `free`, `onway`, `returning`. The
 * endpoint sends three — a rider is idle, out with an order, or coming back.
 * There is no `waiting` rider, because that state is not about a rider at all:
 * in the design it labels an *order* that is waiting for one, and the panel on
 * the right of this tab is the list of exactly those. The type keeps its fourth
 * value rather than being narrowed, because the fixture uses it and the chip
 * palette is keyed off it.
 *
 * ---------------------------------------------------------------------------
 * What the payload does not carry
 *
 * `delivered_today` has nowhere to go — the design's row shows the load on this
 * run, not a day's tally — and there is no vehicle register anywhere in Staff,
 * so the line under a rider's name takes their phone number instead. That is
 * the same slot doing the same job: it is how an operator reaches the person
 * they are looking at, which is why they are looking at the row.
 */

/* =================================================================== queue */

/** `GET /api/v1/orders/orders` → one row, narrowed to what a card draws. */
type ApiOrder = {
  id: number;
  number: string;
  status: string;
  intake_channel: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery: { address: string | null } | null;
  payment_method: string | null;
  payment_state: string | null;
  total: number;
  items_count?: number;
  promised_at: string | null;
  created_at: string | null;
};

/** What the queue tab draws, and whether it is the restaurant's or the design's. */
export type IntakeQueue = {
  orders: readonly QueueOrder[];
  /** False when this is `calls-data.ts`'s own eight — the screen says so. */
  live: boolean;
};

/**
 * The server's six lanes against the design's five chips.
 *
 * `wolt` has no chip in the drawing and still has rows on the server, so it
 * maps to a key that renders and does not filter — see `CHANNEL_NAME.wo`. An
 * order with a lane this map has never heard of is drawn as a phone order
 * rather than dropped: an operator losing a card is worse than an operator
 * seeing one under the wrong chip.
 */
const LANE: Readonly<Record<string, ChannelKey>> = {
  phone: 'tel',
  telegram: 'tg',
  site: 'web',
  yandex: 'ye',
  uzum: 'uz',
  wolt: 'wo',
};

/** The ladder's thirteen rungs against the design's three words. */
function stateOf(status: string): QueueOrder['state'] {
  if (status === 'enroute' || status === 'handed') return 'way';
  if (status === 'placed' || status === 'draft') return 'nw';

  return 'acc';
}

/**
 * What is left of the promise, `m:ss`, or an em dash once it is moot.
 *
 * The design never counts down — it is a figure printed at the moment the page
 * rendered — so this is computed once, on the server, from `promised_at`. An
 * order with no promise on it (a pickup somebody is collecting when they can)
 * shows the dash rather than a zero, because zero reads as "late now".
 *
 * `now` is a parameter so the mapping is a pure function with a testable
 * answer: a clock read inside would make every expected value approximate.
 */
function slaOf(
  promisedAt: string | null,
  status: string,
  now: Date,
): { sla: string; late: boolean } {
  // Only while the answer is still owed. Once a ticket is in the kitchen the
  // number would be a countdown to nothing — the design's own `slaHide`.
  if (promisedAt === null || stateOf(status) !== 'nw') return { sla: '—', late: false };

  const due = Date.parse(promisedAt);

  if (Number.isNaN(due)) return { sla: '—', late: false };

  const seconds = Math.round((due - now.getTime()) / 1000);
  const left = Math.max(0, seconds);
  const minutes = Math.floor(left / 60);

  return {
    sla: `${minutes}:${String(left % 60).padStart(2, '0')}`,
    late: seconds <= 0,
  };
}

/**
 * How the guest is settling, in the words the design's cards use.
 *
 * Two columns, not one: `payment_state` is whether it has been paid and
 * `payment_method` is how. An aggregator order that is already settled reads
 * "Oldindan to'langan", and a cash delivery reads "Naqd, kuryerga" — which is
 * the difference between a rider who collects money and one who does not.
 */
function tenderOf(order: ApiOrder): Trilingual {
  if (order.payment_state === 'paid') return CALLS_COPY.prepaid;
  if (order.payment_method === 'cash') return CALLS_COPY.cashToCourier;
  if (order.payment_method === 'card_on_delivery') return CALLS_COPY.cardOnDelivery;
  if (order.payment_method === 'online') return CALLS_COPY.online;

  return CALLS_COPY.unpaid;
}

function queueCardFrom(order: ApiOrder, now: Date): QueueOrder {
  const { sla, late } = slaOf(order.promised_at, order.status, now);

  return {
    // The bill number, as the guest reads it aloud. The design prints a hash
    // and a live board's numbers already carry their own prefix (`A-0041`), so
    // whatever the restaurant numbers with is what appears.
    id: order.number,
    rowId: order.id,
    channel: LANE[order.intake_channel ?? ''] ?? 'tel',
    // The trilingual value itself when there is no name, rather than one of its
    // three words: an aggregator order reads "Mehmon" on an Uzbek console and
    // "Гость" on a Russian one, like every other sentence on this screen.
    customer: order.customer_name === null ? CALLS_COPY.walkIn : plain(order.customer_name),
    phone: order.customer_phone ?? '—',
    address: plain(order.delivery?.address ?? '—'),
    items: order.items_count ?? 0,
    total: order.total,
    sla,
    late,
    state: stateOf(order.status),
    pay: tenderOf(order),
  };
}

/**
 * The queue an operator answers — everything that did not start at a table.
 *
 * `filter[intake]=true` is what makes this possible; see the file docblock.
 * `filter[open]=true` keeps settled and voided rows off a queue whose whole
 * point is what still needs an answer, and forty is more than a shift's worth
 * of unanswered orders — a queue longer than that is a restaurant in trouble,
 * not a paging problem.
 */
export async function getIntakeQueue(now: Date = new Date()): Promise<IntakeQueue> {
  const answer = await apiGet<Paginated<ApiOrder>>(
    '/orders/orders?filter[intake]=true&filter[open]=true&per_page=40&sort=-created_at',
  );

  if (!answer?.data) return { orders: QUEUE, live: false };

  // An empty queue is a real answer and the best one there is: every order has
  // been dealt with. The panel draws its own empty state for it.
  return { orders: answer.data.map((order) => queueCardFrom(order, now)), live: true };
}

/* ================================================================= compose */

/** `GET /api/v1/menu/items` → what a compose tile needs. */
type ApiDish = { id: number; name: Translated | string; price: number; is_available: boolean };

/** The compose flow's tiles, and whether they are the restaurant's own. */
export type ComposeMenu = {
  items: readonly ComposeItem[];
  /** False when this is `calls-data.ts`'s own eight — the panel says so. */
  live: boolean;
};

/**
 * The eight tiles an operator taps while somebody is on the telephone.
 *
 * The design draws eight and calls them *"the eight things people ring up
 * about"*; the honest live equivalent is the restaurant's own eight, and there
 * is no "most ordered" read that is cheap enough to run on every page load. So
 * it is the first eight sellable dishes in the catalogue's own order — which is
 * the order a restaurant put its menu in, and therefore the order it thinks
 * about its own food in.
 *
 * An EMPTY catalogue is an answer, and it used to take the fixture's tiles.
 * `/calls` is the order-operator's landing screen, so on day one the person
 * taking a telephone order was offered eight dishes the kitchen cannot cook at
 * prices nobody set. Empty and live is empty, and the panel points at `/menu`.
 *
 * `null` — no session, or the API mid-restart — still keeps the design's tiles,
 * which carry no `menuItemId` and therefore cannot be posted: that is what
 * keeps the demo console demonstrating instead of sending word ids to an
 * endpoint that wants numbers.
 */
export async function getComposeMenu(): Promise<ComposeMenu> {
  const answer = await apiGet<Paginated<ApiDish>>('/menu/items?per_page=8&filter[orderable]=1');

  if (!answer?.data) return { items: COMPOSE_MENU, live: false };

  return {
    items: answer.data.map((dish) => ({
      id: String(dish.id),
      menuItemId: dish.id,
      name: {
        uz: translate(dish.name, 'uz'),
        ru: translate(dish.name, 'ru'),
        en: translate(dish.name, 'en'),
      },
      price: dish.price,
    })),
    live: true,
  };
}

/* =================================================================== figures */

/** `GET /api/v1/dashboard?role=operator` → only what the strip above the tabs draws. */
type ApiOperatorDashboard = {
  kpis?: { key: string; value: number | null; delta_percent: number | null }[];
  declined?: number;
  /** Grouped by `orders.intake_channel` — the DOOR, not the fulfilment channel. */
  intake_channels?: { channel: string; orders_count: number; revenue_tiyin: number }[];
};

/**
 * The four figures above the tab strip, and why there are now three.
 *
 * They were literals — `84` orders, `0:38` to answer, a `som(168_000)`
 * constant and `3` declined, each with a delta chip out of the design
 * (`+12 vs yesterday`, `−0:07`, `+4.2%`, `3.4% of orders`). The one role whose
 * whole job is this queue opened on four fabricated scores, above a queue list
 * that is live and can be empty.
 *
 * Three of the four are on the operator arm of the dashboard endpoint, which is
 * the same aggregate `/dashboard` draws for this role — so the strip and that
 * screen cannot disagree. The fourth, time to answer, is not computed anywhere:
 * it needs a telephony log this platform does not have, so the card is dropped
 * rather than filled with something plausible.
 *
 * A delta is shown only where the server measured one — `delta_percent` is
 * populated for `orders` and nothing else on this arm.
 */
export type IntakeStats = {
  taken: number | null;
  takenDeltaPercent: number | null;
  averageOrder: number | null;
  declined: number | null;
  /**
   * Today by door, keyed by the server's own lane word (`phone`, `telegram`,
   * `site`, `yandex`, `uzum`, `wolt`).
   *
   * The channels tab drew these four cells from `CHANNEL_ROWS` — 34 orders and
   * 4 120 000 so'm through a website, a 27% Yandex commission — on a restaurant
   * that has taken none. A lane with no row here has taken nothing.
   */
  channels: Readonly<Record<string, { orders: number; revenue: number }>>;
  /** False when this is the design's own strip. */
  live: boolean;
};

export async function getIntakeStats(): Promise<IntakeStats> {
  const answer = await apiGet<{ data?: ApiOperatorDashboard }>(
    '/dashboard?role=operator&period=today',
  );

  if (!answer?.data) {
    return {
      taken: null,
      takenDeltaPercent: null,
      averageOrder: null,
      declined: null,
      channels: {},
      live: false,
    };
  }

  const kpis = answer.data.kpis ?? [];
  const card = (key: string) => kpis.find((kpi) => kpi.key === key);
  const orders = card('orders');

  return {
    taken: orders?.value ?? null,
    takenDeltaPercent: orders?.delta_percent ?? null,
    averageOrder: card('average_cheque')?.value ?? null,
    declined: answer.data.declined ?? card('declined')?.value ?? null,
    channels: Object.fromEntries(
      (answer.data.intake_channels ?? []).map((lane) => [
        lane.channel,
        { orders: lane.orders_count, revenue: lane.revenue_tiyin },
      ]),
    ),
    live: true,
  };
}

/* =========================================================== intake rules */

/**
 * `GET /api/v1/orders/intake-rules` → the desk's own four switches and its
 * prep time.
 */
type ApiIntakeRules = {
  auto_accept_prepaid: boolean;
  hide_stopped_online: boolean;
  pause_at_peak: boolean;
  peak_ticket_limit: number;
  call_on_cash: boolean;
  prep_minutes: number;
  /** Which of the four the server will actually act on. */
  enforced: Readonly<Record<string, boolean>>;
};

/**
 * How the intake desk behaves when nobody is watching it.
 *
 * The right-hand column of the channels tab: four automation switches and the
 * prep-time picker. They wrote React state and nothing else, which on an
 * automation switch is worse than a control that does nothing — an operator
 * who has "switched on" auto-accept stops watching the queue, and the queue is
 * the job.
 *
 * `enforced` travels with them, exactly as it does on the door switches beside
 * them. Three of the four are recorded intentions today: each needs a producer
 * this platform does not have — an acceptance step that runs without a person,
 * a push to the aggregators' catalogues, a telephony leg — and a screen that
 * could not tell them apart would let somebody believe the queue is being
 * answered without them.
 */
export type IntakeRules = {
  rules: Readonly<Record<string, boolean>>;
  enforced: Readonly<Record<string, boolean>>;
  prepMinutes: number;
  peakTicketLimit: number;
  /** False when this is the design's own column rather than the venue's. */
  live: boolean;
};

export async function getIntakeRules(): Promise<IntakeRules> {
  const answer = await apiGet<{ data?: ApiIntakeRules }>('/orders/intake-rules');

  const row = answer?.data;

  if (!row) {
    /*
     * No session, or a role without `orders.view`. The design's own defaults —
     * which are also the table's, so a live console that has never touched the
     * screen draws exactly this.
     */
    return {
      rules: Object.fromEntries(AUTOMATION_RULES.map((rule) => [rule.key, rule.on])),
      enforced: {},
      prepMinutes: PREP_DEFAULT,
      peakTicketLimit: PEAK_TICKETS_DEFAULT,
      live: false,
    };
  }

  return {
    /*
     * Keyed by the console's own short words, which is the same translation
     * `ROW_LANE` makes for the doors: the design's switches are `auto · stop ·
     * cap · call` and the columns are spelled out. One place, once.
     */
    rules: {
      auto: row.auto_accept_prepaid,
      stop: row.hide_stopped_online,
      cap: row.pause_at_peak,
      call: row.call_on_cash,
    },
    enforced: {
      auto: row.enforced.auto_accept_prepaid === true,
      stop: row.enforced.hide_stopped_online === true,
      cap: row.enforced.pause_at_peak === true,
      call: row.enforced.call_on_cash === true,
    },
    prepMinutes: row.prep_minutes,
    peakTicketLimit: row.peak_ticket_limit,
    live: true,
  };
}

/* ================================================================ delivery */

/** `GET /api/v1/orders/deliveries` → `couriers[]`. */
type ApiCourier = {
  user_id: number;
  name: string;
  phone: string | null;
  /** Three of `CourierState`'s four — see the docblock above. */
  state: 'free' | 'onway' | 'returning';
  /** Orders on this run. */
  active: number;
  delivered_today: number;
};

/** `GET /api/v1/orders/deliveries` → `unassigned[]`. */
type ApiUnassigned = {
  order_id: number;
  number: string;
  address: string | null;
  total_tiyin: number;
  /** How long this order has been waiting for a rider. Whole minutes. */
  waiting_minutes: number;
};

/** What the delivery tab draws: who is out, and what is waiting for them. */
export type DeliveryBoard = {
  couriers: readonly Courier[];
  toAssign: readonly Assignment[];
  /**
   * Order number → row id, for `POST /api/orders` with `action: 'courier'`.
   *
   * `Assignment.id` is the number an operator reads down the phone — `#4821` —
   * and every endpoint is addressed by the row id instead. Empty on fixtures,
   * which is exactly what tells the panel it has nothing real to assign.
   */
  orderIds: Readonly<Record<string, number>>;
  /**
   * The rider the board suggests, or null when nobody is standing free.
   *
   * The design assigns to one name every time (`ASSIGN_TO`, `:10783`) and the
   * button is a single tap — so the screen has to *have* a suggestion, and it
   * is picked here rather than in the browser because this is where the riders'
   * ids are.
   *
   * It is a suggestion and not a dispatch rule. Choosing a different rider is a
   * conversation an operator has on the phone, and the endpoint takes whichever
   * id it is given.
   */
  assignTo: { id: number; name: string } | null;
  /**
   * Every rider the board knows, so the panel can offer a different one.
   *
   * The design's card assigns to one name in one tap, and that stays the
   * primary action — but a rider who breaks down hands the bag over, and an
   * operator on the telephone needs to say so without opening another screen.
   * Empty on fixtures, which is what keeps the picker off a demo board.
   */
  riders: readonly { id: number; name: string; state: ApiCourier['state'] }[];
};

/**
 * A value that is the same in all three languages.
 *
 * A name, an address and a phone number are not translated — they are what is
 * painted on the door and what the rider answers to. Rendering them through the
 * trilingual type rather than around it keeps `say()` the only reader of copy
 * on this screen.
 */
const plain = (value: string): Trilingual => ({ uz: value, ru: value, en: value });

/**
 * "Waiting twelve minutes", in the catalogue's own words.
 *
 * Composed from `CALLS_COPY.minutesShort` and `CALLS_UI.waiting` rather than
 * written out again, because a second copy of "minutes" in three languages is a
 * second copy to fix. The word order differs per language on purpose: Uzbek
 * puts the verb last, Russian and English put it first, and a single template
 * across all three reads as machine translation in two of them.
 */
function waitedFor(minutes: number): Trilingual {
  const unit = CALLS_COPY.minutesShort;
  const verb = CALLS_UI.waiting;

  return {
    uz: `${minutes} ${unit.uz} ${verb.uz}`,
    ru: `${verb.ru} ${minutes} ${unit.ru}`,
    en: `${verb.en} ${minutes} ${unit.en}`,
  };
}

/** The two letters in an avatar circle. Two words at most, or the badge overflows. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase();
}

function courierFrom(api: ApiCourier): Courier {
  return {
    name: api.name,
    initials: initialsOf(api.name),
    // No vehicle register exists; the phone is the one contact detail on the
    // payload and it is what an operator reaches for. An em dash rather than an
    // empty line, which reads as a broken row.
    vehicle: plain(api.phone ?? '—'),
    state: api.state,
    load: api.active,
  };
}

function assignmentFrom(api: ApiUnassigned): Assignment {
  return {
    id: api.number,
    total: api.total_tiyin,
    address: plain(api.address ?? '—'),
    due: waitedFor(api.waiting_minutes),
    /*
     * Late, as a lower bound rather than a guess.
     *
     * The payload carries no promised time — only how long this order has sat
     * with no rider on it. But the time quoted to a guest is prep plus the
     * ride, so an order that has been waiting for a courier longer than the
     * whole prep window has already missed it, whatever it was: the ride has
     * not started. That makes this red only where lateness is certain, and
     * never red on an order that is merely close — which is the right direction
     * for a tint an operator acts on.
     */
    late: api.waiting_minutes > PREP_DEFAULT,
  };
}

/**
 * The delivery board for this render — the API's when there is a session.
 *
 * Each half falls back on its own. A payload that answers the riders but has
 * not learned to list unassigned orders should show the real riders rather than
 * five sample ones, and `null` from `apiGet` — no session, an expired token, an
 * API mid-restart — puts both halves back on the design's own figures.
 */
export async function getDeliveryBoard(): Promise<DeliveryBoard> {
  const answer = await apiGet<{
    data?: { couriers?: ApiCourier[]; unassigned?: ApiUnassigned[] };
  }>('/orders/deliveries');

  if (!answer?.data) {
    return { couriers: COURIERS, toAssign: TO_ASSIGN, orderIds: {}, assignTo: null, riders: [] };
  }

  const { couriers, unassigned } = answer.data;

  return {
    couriers: couriers === undefined ? COURIERS : couriers.map(courierFrom),
    // An empty list is a real answer — every order has a rider on it — and the
    // panel draws that as an empty column, which is the good news it is.
    toAssign: unassigned === undefined ? TO_ASSIGN : unassigned.map(assignmentFrom),
    orderIds: Object.fromEntries((unassigned ?? []).map((job) => [job.number, job.order_id])),
    assignTo: suggest(couriers ?? []),
    /*
     * Everybody, including whoever is mid-delivery.
     *
     * `suggest()` below deliberately never offers a rider who is `onway`; the
     * picker does, because the operator may know something the board cannot —
     * that the scooter is two streets from this address anyway. A suggestion is
     * a default, and a list somebody chose from is a decision.
     */
    riders: (couriers ?? []).map((rider) => ({
      id: rider.user_id,
      name: rider.name,
      state: rider.state,
    })),
  };
}

/**
 * Whose next drop this should be.
 *
 * A rider who is `onway` is never offered: they are mid-delivery with somebody
 * else's dinner in the bag, and stacking a third drop on them while another
 * rider stands at the door is how the two-minute order arrives cold. Of the two
 * states that remain, `free` beats `returning` — one is outside the kitchen
 * now, the other is five minutes away.
 *
 * Load is not a tiebreak, and cannot be: `DeliveryController::stateOf()` makes
 * any rider who is carrying something `onway`, so everybody reaching this line
 * is carrying nothing. Sorting on `active` here would look careful and compare
 * zero with zero.
 */
function suggest(couriers: readonly ApiCourier[]): { id: number; name: string } | null {
  const next =
    couriers.find((rider) => rider.state === 'free') ??
    couriers.find((rider) => rider.state === 'returning');

  return next === undefined ? null : { id: next.user_id, name: next.name };
}
