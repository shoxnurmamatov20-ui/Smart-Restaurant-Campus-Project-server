import type { Messages } from '@/i18n';

/**
 * The kitchen display, as the design's KDS shows it.
 *
 * Both halves are live. `kds-server.ts` reads `GET /api/v1/kitchen/tickets`
 * and the 86 sheet beside it; `kds-board.tsx` joins `branch.{id}.kitchen` and
 * `branch.{id}.stoplist` and moves the cards as they change. This screen is the
 * one that cannot be polled — a ticket that appears thirty seconds late is a
 * dish that leaves thirty seconds late, every time — so the fixtures below are
 * only what a console with no session behind it draws.
 */

type Kitchen = Messages['console']['kitchen'];

export type TicketState = 'colNew' | 'colAccepted' | 'colCooking' | 'colReady' | 'colServed';

/**
 * The number a cook shouts across the pass.
 *
 * Two digits off the order number, and two on purpose: "twelve ninety-one" is
 * not something anybody calls across a hot line, and a chip reading `91` is.
 * Derived rather than stored — the order number is the identity and this is a
 * *nickname*, so two tickets sharing a nickname is fine and two tickets sharing
 * an id is not.
 */
export const callNumber = (orderId: string): string => orderId.replace(/\D/g, '').slice(-2);

export type TicketLine = {
  quantity: number;
  /** A dish name as the kitchen prints it. */
  name: string;
  note?: keyof Pick<Kitchen, 'noteNoOnion' | 'noteExtraSauce' | 'noteNoChilli' | 'noteCutEight'>;

  /**
   * What the guest asked for, in their own words.
   *
   * The field that matters most on the whole board. "Piyozsiz" is not a
   * preference — for somebody with an allergy it is the reason they can eat —
   * and a cook reading a line without it plates the wrong dish while every
   * screen behind them shows the right one.
   *
   * Free text from the API, already in the reader's language, so it is drawn
   * rather than translated. The fixture `note` above is a catalogue key and
   * stays for the demo board.
   */
  modifiers?: readonly string[];

  /** Which guest ordered it, so a runner can put four plates down correctly. */
  seat?: number;
};

export type Ticket = {
  id: string;
  /**
   * The row's own id, for the button.
   *
   * `id` above is the ORDER number — what a cook shouts across a pass — and two
   * dockets from one bill share it, one per station. Pressing "ready" on the
   * grill's docket must not mark the pastry's, so the button needs the row.
   *
   * Optional because the fixture board has no rows behind it; a card with no
   * `ticketId` renders its button disabled rather than pretending.
   */
  ticketId?: number;
  /** Table, room or channel — a proper noun. */
  table: string;
  /**
   * Which station is cooking it, as a code the API uses (`grill`, `bar`, …).
   *
   * The station tabs filter on this, and they have to filter on the code rather
   * than on the heading above the card: `table` falls back to the station name
   * when a docket has no table — a delivery, a takeaway — so matching on what is
   * drawn would quietly work for half the board and fail for the other half.
   */
  station: string;
  waiter: string;
  /**
   * How long it has been where it is, as the kitchen sees it.
   *
   * A fallback, for the fixture board. When `since` is set the board counts for
   * itself and ignores this — see below for why it has to.
   */
  age: string;
  /** The same in whole minutes, which is what the colour keys on. */
  minutes: number;
  /**
   * The moment this age is counted from, in epoch milliseconds.
   *
   * The board is a client component and there is no second server render to
   * correct a stale figure: a wall screen is switched on in the morning and looked
   * at until midnight. So the timers cannot be strings computed once — the whole
   * board would freeze at whatever time it was painted, and a ticket sitting for
   * forty minutes would keep claiming it was two minutes old, in black, next to a
   * red one that arrived after it.
   *
   * Which moment it is depends on where the ticket is, and the design says so in
   * the caption under each timer: a docket on the line counts from when the cook
   * started (or when it landed, if nobody has), and one on the pass counts from
   * when it became ready. Those are two different questions — "how long has this
   * been cooking" and "how long has this been going cold" — and one field answers
   * whichever the column is asking.
   */
  since?: number;
  state: TicketState;
  lines: readonly TicketLine[];
};

export const TICKETS: readonly Ticket[] = [
  {
    id: 'A-1293',
    station: 'hot',
    table: 'Stol 5',
    waiter: 'Aziza R.',
    age: '0:38',
    minutes: 0,
    state: 'colNew',
    lines: [
      { quantity: 2, name: 'Osh, beef', note: 'noteNoOnion' },
      { quantity: 1, name: 'Achichuk' },
      { quantity: 2, name: 'Green tea' },
    ],
  },
  {
    id: 'A-1292',
    station: 'grill',
    table: 'Terrassa 1',
    waiter: 'Nodira S.',
    age: '1:52',
    minutes: 1,
    state: 'colNew',
    lines: [
      { quantity: 1, name: 'Cheeseburger' },
      { quantity: 1, name: 'Lavash, chicken', note: 'noteExtraSauce' },
    ],
  },
  {
    id: 'A-1291',
    station: 'grill',
    table: 'Stol 12',
    waiter: 'Aziza R.',
    age: '4:10',
    minutes: 4,
    state: 'colAccepted',
    lines: [
      { quantity: 3, name: 'Shashlik, lamb' },
      { quantity: 1, name: 'Margherita' },
      { quantity: 2, name: 'Ayron' },
    ],
  },
  {
    id: 'A-1290',
    station: 'hot',
    table: 'Stol 8',
    waiter: 'Nodira S.',
    age: '7:24',
    minutes: 7,
    state: 'colCooking',
    lines: [
      { quantity: 4, name: 'Manti' },
      { quantity: 2, name: "Lag'mon", note: 'noteNoChilli' },
      { quantity: 1, name: 'Caesar' },
    ],
  },
  {
    id: 'A-1289',
    station: 'hot',
    table: 'VIP 2',
    waiter: 'Nodira S.',
    age: '11:02',
    minutes: 11,
    state: 'colCooking',
    lines: [
      { quantity: 6, name: 'Osh, beef' },
      { quantity: 3, name: 'Somsa, beef' },
      { quantity: 2, name: 'Pepperoni', note: 'noteCutEight' },
    ],
  },
  {
    id: 'A-1288',
    station: 'grill',
    table: 'Stol 7',
    waiter: 'Jasur T.',
    age: '2:15',
    minutes: 2,
    state: 'colReady',
    lines: [
      { quantity: 2, name: 'Double beef' },
      { quantity: 2, name: 'Coca-Cola 0.5' },
    ],
  },
  {
    id: 'A-1287',
    station: 'cold',
    table: 'Yandex Eats',
    waiter: 'Kuryer 4',
    age: '0:44',
    minutes: 0,
    state: 'colReady',
    lines: [
      { quantity: 1, name: 'Lavash, classic' },
      { quantity: 1, name: 'Napoleon' },
    ],
  },
];

/** The columns, in the order a ticket moves through them. */
/**
 * The five columns, and what the button on each one does.
 *
 * `move` is the API path segment the button posts to — the same word the
 * endpoint is named after, so a column and its action cannot drift apart. The
 * last column has none: a served ticket is finished and its button is there to
 * be greyed out, not pressed.
 */
export const COLUMNS: readonly {
  state: TicketState;
  accent: string;
  action: string;
  move: 'accept' | 'start' | 'ready' | 'serve' | null;
}[] = [
  { state: 'colNew', accent: 'var(--border-strong)', action: 'btnAccept', move: 'accept' },
  { state: 'colAccepted', accent: 'var(--brand-500)', action: 'btnStart', move: 'start' },
  { state: 'colCooking', accent: 'var(--warning-500)', action: 'btnReady', move: 'ready' },
  { state: 'colReady', accent: 'var(--success-500)', action: 'btnServed', move: 'serve' },
  { state: 'colServed', accent: 'var(--n-500)', action: 'btnDone', move: null },
];

/**
 * The API's ticket states against the five columns.
 *
 * One map, read by both halves of this screen — the server render and the live
 * board — because they must agree. When each kept its own copy the risk was not
 * hypothetical: a state added on the API would land in one and not the other,
 * and a docket would be drawn in a column on first paint and vanish on the
 * broadcast that followed.
 *
 * `served` is a state the board shows briefly before the ticket leaves the
 * screen. `recalled` maps back onto cooking, which is where the cook will look
 * for it. `cancelled` is absent on purpose: a cancelled docket is dropped rather
 * than drawn, because an empty column headed "cancelled" is nobody's job.
 */
export const STATE_OF: Readonly<Record<string, TicketState>> = {
  new: 'colNew',
  accepted: 'colAccepted',
  cooking: 'colCooking',
  recalled: 'colCooking',
  ready: 'colReady',
  served: 'colServed',
};

/**
 * The station tabs, and what each one selects.
 *
 * `code` is the API's own station code, and `null` is the pass — every station at
 * once, which is what a chef running the line watches. Pastry was missing from
 * this list while the tabs were decoration: five stations are seeded and only four
 * had a tab, so a `pastry` docket was on the board and unreachable the moment the
 * tabs started filtering.
 */
export const STATIONS: readonly { code: string | null; label: StationLabel }[] = [
  { code: null, label: 'stationAll' },
  { code: 'hot', label: 'stationHot' },
  { code: 'grill', label: 'stationGrill' },
  { code: 'cold', label: 'stationCold' },
  { code: 'bar', label: 'stationBar' },
  { code: 'pastry', label: 'stationPastry' },
];

type StationLabel = keyof Pick<
  Kitchen,
  'stationAll' | 'stationHot' | 'stationGrill' | 'stationCold' | 'stationBar' | 'stationPastry'
>;

/**
 * One line of the 86 sheet.
 *
 * Every dish the kitchen could stop, not only the stopped ones — because the dish
 * a chef opens the sheet looking for is by definition still on. `stopped` is what
 * the switch reads.
 */
export type StopEntry = {
  dishId: number;
  title: string;
  /** An API station code, matched against the tabs above the board. */
  station: string;
  stopped: boolean;
  /** Who took it off and why, when somebody did. */
  stoppedBy: string | null;
  reason: string | null;
  /** ISO-8601 — when it comes back on its own. */
  until: string | null;
};

/**
 * A timer, counted now.
 *
 * `m:ss` for the first hour and beyond it — a docket that has been on the pass
 * for seventy-four minutes reads `74:12`, not `1:14:12`, because the number a
 * chef is scanning for is minutes and a leading hour makes every card a
 * different width.
 */
export function elapsed(since: number, now: number): { age: string; minutes: number } {
  const seconds = Math.max(0, Math.floor((now - since) / 1_000));
  const minutes = Math.floor(seconds / 60);

  return { age: `${minutes}:${String(seconds % 60).padStart(2, '0')}`, minutes };
}

/**
 * The three figures across the top of the board, counted from the board.
 *
 * They used to be `KITCHEN_SUMMARY`, a constant — so a wall screen over a real
 * hot line read "7 open · 8:40 average · 11:02 longest" above five empty
 * columns, for ever. Chefs are trained to act on this strip; a strip that
 * cannot go to zero is a strip that cannot report a quiet kitchen either.
 *
 * Counted over the tickets the screen is actually showing (the station filter
 * has already been applied by the caller) and over the ones still in play — a
 * served docket is on its way off the board and is nobody's waiting time.
 *
 * `now` is null until the client's first tick, exactly as the cards have it, so
 * the figures fall back to the elapsed minutes the API sent rather than to a
 * time the server could not have known. Null for both timings when there is
 * nothing open: the caller draws a dash, which is the honest reading.
 */
export type BoardSummary = {
  open: number;
  averageCook: string | null;
  longestWait: string | null;
};

/** How long this docket has been counting, in whole seconds. */
function secondsOnBoard(ticket: Ticket, now: number | null): number {
  if (ticket.since !== undefined && now !== null) {
    return Math.max(0, Math.floor((now - ticket.since) / 1_000));
  }

  return Math.max(0, ticket.minutes) * 60;
}

const asClock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;

export function boardSummary(tickets: readonly Ticket[], now: number | null): BoardSummary {
  const open = tickets.filter((ticket) => ticket.state !== 'colServed');

  if (open.length === 0) return { open: 0, averageCook: null, longestWait: null };

  const seconds = open.map((ticket) => secondsOnBoard(ticket, now));
  const total = seconds.reduce((sum, value) => sum + value, 0);

  return {
    open: open.length,
    averageCook: asClock(Math.floor(total / open.length)),
    longestWait: asClock(Math.max(...seconds)),
  };
}

/**
 * How old is too old.
 *
 * Ten minutes turns the ticket red and its border with it; six turns the timer
 * amber. Both are the design's (`Smart Restaurant OS.dc.html:13284–13287`:
 * `t.mins >= 10` for the danger colour and the border, `>= 6` for the timer),
 * and both are per-ticket rather than per-dish because a table is served
 * together or not at all.
 *
 * Named rather than inlined because the ten is read in three places now — the
 * colour, the "Kechikdi" label, and the once-only pulse `FOUNDATIONS §4` asks
 * for. Three copies of a threshold is three chances for a card to be red and
 * silent, or labelled late and drawn calm.
 */
export const LATE_MINUTES = 10;

export const WARNING_MINUTES = 6;

export function ageTone(minutes: number): { text: string; border: string } {
  if (minutes >= LATE_MINUTES) return { text: 'text-danger-500', border: 'border-danger-500' };
  if (minutes >= WARNING_MINUTES) return { text: 'text-warning-500', border: 'border-border' };

  return { text: 'text-fg', border: 'border-border' };
}

/* ------------------------------------------------------------------ */

/**
 * The kitchen's own words, for the two the catalogue does not carry.
 *
 * `console.kitchen` covers everything the board draws. What is here is what the
 * design's `flash()` says when a chef takes a dish off (`dc.html:17530`) — a
 * sentence with a dish name in it, which is why it cannot be a catalogue key on
 * its own. Copied from the design's `P("uz","ru","en")` verbatim.
 */
export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export function say(locale: string, phrase: Trilingual): string {
  return phrase[(locale as Lang) in phrase ? (locale as Lang) : 'uz'];
}

export const KDS_COPY = {
  stopAdded: {
    uz: "stop-listga qo'shildi",
    ru: 'добавлено в стоп-лист',
    en: 'added to the stop list',
  },
  stopLifted: {
    uz: 'stop-listdan chiqarildi',
    ru: 'убрано из стоп-листа',
    en: 'back on the menu',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

/** What the stop list offers to switch off. */
export const STOPPABLE: readonly { name: string; station: string; off: boolean }[] = [
  { name: 'Osh, beef', station: 'stationHot', off: false },
  { name: "Lag'mon", station: 'stationHot', off: false },
  { name: 'Manti', station: 'stationHot', off: false },
  { name: 'Somsa, beef', station: 'stationHot', off: false },
  { name: 'Shashlik, lamb', station: 'stationGrill', off: false },
  { name: 'Cheeseburger', station: 'stationGrill', off: false },
  { name: 'Double beef', station: 'stationGrill', off: true },
  { name: 'Lavash, classic', station: 'stationCold', off: false },
  { name: 'Caesar', station: 'stationCold', off: false },
  { name: 'Margherita', station: 'stationHot', off: false },
  { name: 'Pepperoni', station: 'stationHot', off: false },
  { name: 'Green tea', station: 'stationBar', off: false },
];
