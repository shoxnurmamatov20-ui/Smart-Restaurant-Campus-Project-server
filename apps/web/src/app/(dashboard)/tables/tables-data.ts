import type { Messages } from '@/i18n';

/**
 * The floor, as the design's screen shows it.
 *
 * Figures and ids only; zone names, statuses and the panel's labels are copy
 * and live in src/i18n. Money is integer tiyin, as everywhere else.
 *
 * The API seam is NOT here: ./tables-server.ts holds it. This module is imported
 * by the POS terminal, which is a client component, and `@/lib/api-server`
 * reads `next/headers` — pulling it in here breaks the browser build. Types and
 * fixtures stay client-safe; anything that talks to the server lives next door.
 *
 * TODO(api): Reverb has to push the changes. A table's status must move the
 * moment the till or the waiter's tablet moves it, or the host seats someone
 * twice; this render is a snapshot.
 */

export type TableStatus = 'free' | 'seated' | 'reserved' | 'cleaning' | 'to_pay';
export type ZoneKey = 'zoneMain' | 'zoneTerrace' | 'zoneVip';

export type Table = {
  name: string;
  /**
   * Which room, for the fixtures.
   *
   * Optional because the API groups by hall instead — see `getFloor()`, which
   * hands the screen rooms with their tables already in them. A fixture needs
   * this to be grouped at all; an API row is grouped before it gets here.
   */
  zone?: ZoneKey;
  seats: number;
  status: TableStatus;
  /** Present while someone is sitting there. */
  guests?: number;
  since?: string;
  waiter?: string;
  bill?: number;
  /** Present when the table is held: the time, the name and the party size. */
  reservation?: string;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const TABLES: readonly Table[] = [
  {
    name: 'T1',
    zone: 'zoneMain',
    seats: 4,
    status: 'seated',
    guests: 3,
    since: '10:42',
    waiter: 'Aziza R.',
    bill: som(186_000),
  },
  { name: 'T2', zone: 'zoneMain', seats: 2, status: 'free' },
  {
    name: 'T3',
    zone: 'zoneMain',
    seats: 4,
    status: 'seated',
    guests: 4,
    since: '11:04',
    waiter: 'Jasur T.',
    bill: som(242_000),
  },
  { name: 'T4', zone: 'zoneMain', seats: 6, status: 'reserved', reservation: '12:30 · Kamolov, 6' },
  { name: 'T5', zone: 'zoneMain', seats: 4, status: 'free' },
  { name: 'T6', zone: 'zoneMain', seats: 2, status: 'cleaning' },
  {
    name: 'T7',
    zone: 'zoneMain',
    seats: 4,
    status: 'to_pay',
    guests: 4,
    since: '09:58',
    waiter: 'Jasur T.',
    bill: som(318_000),
  },
  {
    name: 'T8',
    zone: 'zoneMain',
    seats: 8,
    status: 'seated',
    guests: 7,
    since: '10:15',
    waiter: 'Nodira S.',
    bill: som(612_000),
  },
  { name: 'T9', zone: 'zoneMain', seats: 4, status: 'free' },
  {
    name: 'T10',
    zone: 'zoneMain',
    seats: 4,
    status: 'seated',
    guests: 2,
    since: '11:12',
    waiter: 'Aziza R.',
    bill: som(94_000),
  },
  { name: 'T11', zone: 'zoneMain', seats: 2, status: 'free' },
  {
    name: 'T12',
    zone: 'zoneMain',
    seats: 6,
    status: 'seated',
    guests: 5,
    since: '10:50',
    waiter: 'Aziza R.',
    bill: som(402_000),
  },

  {
    name: 'P1',
    zone: 'zoneTerrace',
    seats: 4,
    status: 'seated',
    guests: 4,
    since: '11:20',
    waiter: 'Nodira S.',
    bill: som(128_000),
  },
  { name: 'P2', zone: 'zoneTerrace', seats: 4, status: 'free' },
  {
    name: 'P3',
    zone: 'zoneTerrace',
    seats: 6,
    status: 'reserved',
    reservation: '13:00 · Yusupova, 5',
  },
  { name: 'P4', zone: 'zoneTerrace', seats: 4, status: 'cleaning' },
  { name: 'P5', zone: 'zoneTerrace', seats: 2, status: 'free' },
  {
    name: 'P6',
    zone: 'zoneTerrace',
    seats: 4,
    status: 'seated',
    guests: 3,
    since: '11:08',
    waiter: 'Jasur T.',
    bill: som(176_000),
  },

  {
    name: 'V1',
    zone: 'zoneVip',
    seats: 10,
    status: 'reserved',
    reservation: '19:00 · Corporate, 10',
  },
  {
    name: 'VIP 2',
    zone: 'zoneVip',
    seats: 12,
    status: 'seated',
    guests: 9,
    since: '10:30',
    waiter: 'Nodira S.',
    bill: som(1_240_000),
  },
];

export const ZONES: readonly ZoneKey[] = ['zoneMain', 'zoneTerrace', 'zoneVip'];

/**
 * How each status is drawn.
 *
 * The glyph matters as much as the colour: the design marks a free table with
 * an open ring and an occupied one with a filled dot, so the floor is readable
 * to someone who cannot separate green from blue. A held table also gets a
 * dashed border — a third channel, because a host reads this across a room.
 */
export const TABLE_STATUS: Record<
  TableStatus,
  { glyph: string; dot: string; tile: string; label: string }
> = {
  free: {
    glyph: '○',
    dot: 'var(--success-500)',
    tile: 'bg-surface border-border',
    label: 'text-success-700',
  },
  seated: {
    glyph: '●',
    dot: 'var(--brand-500)',
    tile: 'bg-brand-50 border-brand-200',
    label: 'text-brand-700',
  },
  reserved: {
    glyph: '◷',
    dot: 'var(--accent-500)',
    tile: 'bg-surface border-border border-dashed',
    label: 'text-accent-700',
  },
  cleaning: {
    glyph: '◌',
    dot: 'var(--n-400)',
    tile: 'bg-surface border-border',
    label: 'text-fg-subtle',
  },
  to_pay: {
    glyph: '₴',
    dot: 'var(--warning-500)',
    tile: 'bg-warning-50 border-warning-500',
    label: 'text-warning-700',
  },
};

/** The order the legend lists them in. */
export const TABLE_STATUSES: readonly TableStatus[] = [
  'free',
  'seated',
  'reserved',
  'cleaning',
  'to_pay',
];

/** A table is taken when someone is at it — seated or waiting to pay. */
export const isOccupied = (table: Table): boolean =>
  table.status === 'seated' || table.status === 'to_pay';

export type FloorCopy = Messages['console']['floor'];
