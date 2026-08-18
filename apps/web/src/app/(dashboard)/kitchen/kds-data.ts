import type { Messages } from '@/i18n';

/**
 * The kitchen display, as the design's KDS shows it.
 *
 * TODO(api): GET /api/v1/kitchen/tickets and a Reverb channel. This screen is
 * the one that cannot be polled: a ticket that appears thirty seconds late is
 * a dish that leaves thirty seconds late, every time.
 */

type Kitchen = Messages['console']['kitchen'];

export type TicketState = 'colNew' | 'colAccepted' | 'colCooking' | 'colReady' | 'colServed';

export type TicketLine = {
  quantity: number;
  /** A dish name as the kitchen prints it. */
  name: string;
  note?: keyof Pick<Kitchen, 'noteNoOnion' | 'noteExtraSauce' | 'noteNoChilli' | 'noteCutEight'>;
};

export type Ticket = {
  id: string;
  /** Table, room or channel — a proper noun. */
  table: string;
  waiter: string;
  /** How long it has been where it is, as the kitchen sees it. */
  age: string;
  /** The same in whole minutes, which is what the colour keys on. */
  minutes: number;
  state: TicketState;
  lines: readonly TicketLine[];
};

export const TICKETS: readonly Ticket[] = [
  {
    id: 'A-1293',
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
export const COLUMNS: readonly { state: TicketState; accent: string; action: string }[] = [
  { state: 'colNew', accent: 'var(--border-strong)', action: 'btnAccept' },
  { state: 'colAccepted', accent: 'var(--brand-500)', action: 'btnStart' },
  { state: 'colCooking', accent: 'var(--warning-500)', action: 'btnReady' },
  { state: 'colReady', accent: 'var(--success-500)', action: 'btnServed' },
  { state: 'colServed', accent: 'var(--n-500)', action: 'btnDone' },
];

export const STATIONS = [
  'stationAll',
  'stationHot',
  'stationGrill',
  'stationCold',
  'stationBar',
] as const;

/**
 * How old is too old.
 *
 * Ten minutes turns the ticket red and its border with it; six turns the timer
 * amber. Both are the design's, and both are per-ticket rather than per-dish
 * because a table is served together or not at all.
 */
export function ageTone(minutes: number): { text: string; border: string } {
  if (minutes >= 10) return { text: 'text-danger-500', border: 'border-danger-500' };
  if (minutes >= 6) return { text: 'text-warning-500', border: 'border-border' };

  return { text: 'text-fg', border: 'border-border' };
}

/** The kitchen's own figures, across the top. */
export const KITCHEN_SUMMARY = { open: 7, averageCook: '8:40', longestWait: '11:02' } as const;

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
