/**
 * The settings screen's figures, ids and switch positions.
 *
 * Everything on those eight panels that is the same in Uzbek, Russian and
 * English: a printer's IP, a payment method's share of today's takings, which
 * toggles start on. The sentences that go with each row are in `src/i18n` under
 * `console.settingsPanels`, keyed by the same order and the same keys, and
 * `settings-copy.ts` puts the two together.
 *
 * The split is the one `i18n.test.ts` enforces: a row that reads the same in
 * all three languages is data, and holding it in three catalogues at once is
 * how two of them fall out of date.
 *
 * These stay fixtures on purpose and are not a backlog. The live reads live in
 * the sibling `settings-server.ts` — printers, tills, zones, the online rails
 * and the receipt requisites all come from the API and are laid over these rows
 * — and what is here is what a console with no session, or one whose API is
 * mid-restart, draws instead. Deleting a row from this file would make the
 * demo console emptier, not the live one more honest.
 *
 * Two arrays have no server behind them at all and the panels say which: the
 * payment methods and the expense categories. Both need a table that does not
 * exist, and the reasons are written at the controls in `settings-panels.tsx`.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type PrinterKind = 'kitchen' | 'bar' | 'till' | 'pass';
export type PayKind = 'cash' | 'card' | 'debt';
export type StateTone = 'neutral' | 'brand' | 'warning' | 'success' | 'danger';
export type Channel = 'dine' | 'delivery' | 'pickup';

/** Which catalogue label a terminal identity row carries, and its value. */
export type IdentityRow = {
  label: 'terminalName' | 'branch' | 'zone' | 'orderType' | 'version';
  /** `null` where the value itself is translated — see `identityValues`. */
  value: string | null;
  mono: boolean;
};

export const TERMINAL_DATA = {
  modeKeys: ['minimal', 'status', 'brand'] as const,
  backgrounds: [
    { key: 'night', swatch: 'linear-gradient(165deg,#141A28 0%,#0B0E16 58%,#0F1320 100%)' },
    { key: 'ink', swatch: 'linear-gradient(165deg,#1F2533 0%,#0F1320 100%)' },
    { key: 'warm', swatch: 'linear-gradient(165deg,#2A2119 0%,#14100C 100%)' },
    { key: 'photo', swatch: 'linear-gradient(165deg,#3A4356 0%,#1A1F2B 100%)' },
  ],
  blockKeys: ['clock', 'brand', 'stats', 'health', 'msg'] as const,
  secKeys: ['pinSet', 'pinShift'] as const,
  stats: [{ value: '14' }, { value: '18' }, { value: '8' }, { value: '18.4M', good: true }],
  identityRows: [
    { label: 'terminalName', value: 'POS-3', mono: true },
    { label: 'branch', value: 'Chilonzor', mono: false },
    { label: 'zone', value: null, mono: false },
    { label: 'orderType', value: null, mono: false },
    { label: 'version', value: 'v2.4.0', mono: true },
  ] as readonly IdentityRow[],
};

export const PRINTER_ROWS = [
  {
    id: 'p1',
    name: 'P-OSHXONA',
    ip: '192.168.100.152:9100',
    kind: 'kitchen',
    up: true,
    last: '18:22',
    dishes: 9,
  },
  {
    id: 'p2',
    name: 'P-SALAT',
    ip: '192.168.100.153:9100',
    kind: 'kitchen',
    up: false,
    last: '14:07',
    dishes: 2,
  },
  {
    id: 'p3',
    name: 'P-BAR',
    ip: '192.168.100.154:9100',
    kind: 'bar',
    up: true,
    last: '18:19',
    dishes: 1,
  },
  {
    id: 'p4',
    name: 'P-KASSA',
    ip: '192.168.100.150:9100',
    kind: 'till',
    up: true,
    last: '18:23',
    dishes: 0,
  },
] as const;

export const RECEIPT_DATA = {
  brand: 'SMART RESTAURANT',
  address: 'Bunyodkor sh. 12 · +998 71 200 40 40',
  taxId: 'STIR 302 458 719',
  phones: '+998 71 200 40 40 · +998 90 123 45 67',
  metaReceiptValue: '№ 004 812',
  metaDateValue: '17.08.2026 21:14',
  metaTableValue: '12 · 1 / 2',
  metaGuestsValue: '4',
  metaOrdersValue: '25 69 70',
  metaWaiterValue: 'Jasur T.',
  lines: [
    { name: "2 × Osh, to'y oshi", value: '96 000' },
    { name: "1 × Lag'mon", value: '52 000' },
    { name: "4 × Choy, ko'k", value: '32 000' },
  ],
  totals: [
    { key: 'items', value: '246 000' },
    { key: 'svc', value: '24 600' },
    { key: 'total', value: '270 600' },
    { key: 'vat', value: '29 000' },
  ] as const,
  toggleKeys: [
    'logo',
    'info',
    'stir',
    'waiter',
    'guests',
    'orders',
    'svc',
    'qr',
    'thanks',
    'phone',
  ] as const,
};

export const PAY_ROWS = [
  { id: 'm1', name: 'NAQD', kind: 'cash', fiscal: true, on: true, share: 31 },
  { id: 'm2', name: 'KARTA · Uzcard/Humo', kind: 'card', fiscal: true, on: true, share: 46 },
  { id: 'm3', name: 'CLICK', kind: 'card', fiscal: true, on: true, share: 12 },
  { id: 'm4', name: 'PAYME', kind: 'card', fiscal: true, on: true, share: 6 },
  { id: 'm5', name: 'DOLG', kind: 'debt', fiscal: false, on: true, share: 5 },
  { id: 'm6', name: 'UZUM NASIYA', kind: 'card', fiscal: true, on: false, share: 0 },
] as const;

export const CATEGORY_ROWS = {
  income: [
    { id: 'i1', sum: som(18_420_000), used: 192 },
    { id: 'i2', sum: som(640_000), used: 48 },
    { id: 'i3', sum: som(1_240_000), used: 6 },
    { id: 'i4', sum: som(120_000), used: 2 },
  ],
  expense: [
    { id: 'o1', sum: som(6_840_000), used: 34 },
    { id: 'o2', sum: som(4_200_000), used: 1 },
    { id: 'o3', sum: som(1_180_000), used: 4 },
    { id: 'o4', sum: som(9_600_000), used: 24 },
    { id: 'o5', sum: som(840_000), used: 3 },
    { id: 'o6', sum: som(460_000), used: 7 },
  ],
};

export const ZONE_ROWS = [
  { id: 'z1', name: 'ZAL', tables: 18, seats: 68, svc: true },
  { id: 'z2', name: 'VIP-ZAL', tables: 6, seats: 34, svc: true },
  { id: 'z3', name: 'KABINA', tables: 5, seats: 30, svc: true },
  { id: 'z4', name: null, tables: 3, seats: 12, svc: false },
];

export const NOTIFY_DATA = {
  botHandle: '@smartrestaurant_ops_bot',
  events: [
    { key: 'cash', on: true },
    { key: 'stock', on: true },
    { key: 'disc', on: true },
    { key: 'void', on: true },
    { key: 'target', on: false },
    { key: 'shift', on: false },
  ],
};

export const RELEASE_ROWS = [
  { version: '2.4.0', date: '17.08.2026', major: true },
  { version: '2.3.4', date: '02.08.2026', major: false },
  { version: '2.3.1', date: '21.07.2026', major: false },
  { version: '2.3.0', date: '08.07.2026', major: true },
  { version: '2.2.6', date: '19.06.2026', major: false },
  { version: '2.2.0', date: '30.05.2026', major: true },
  { version: '2.1.2', date: '14.05.2026', major: false },
  { version: '2.1.0', date: '26.04.2026', major: true },
] as const;

export const STATE_ROWS = [
  { key: 'draft', tone: 'neutral', channels: ['dine'] },
  { key: 'placed', tone: 'neutral', channels: ['dine', 'delivery', 'pickup'] },
  { key: 'accepted', tone: 'brand', channels: ['dine', 'delivery', 'pickup'] },
  { key: 'cooking', tone: 'warning', channels: ['dine', 'delivery', 'pickup'] },
  { key: 'ready', tone: 'success', channels: ['dine', 'delivery', 'pickup'] },
  { key: 'served', tone: 'neutral', channels: ['dine'] },
  { key: 'enroute', tone: 'brand', channels: ['delivery'] },
  { key: 'handed', tone: 'neutral', channels: ['delivery', 'pickup'] },
  { key: 'topay', tone: 'warning', channels: ['dine'] },
  { key: 'paid', tone: 'neutral', channels: ['dine', 'delivery', 'pickup'] },
  { key: 'voided', tone: 'danger', channels: ['dine', 'delivery', 'pickup'] },
  { key: 'refunded', tone: 'danger', channels: ['dine', 'delivery', 'pickup'] },
] as const;

export const POLICY_SWITCHES = [
  [true, true, true, true],
  [true, true, false],
  [true, true, true],
] as const;
