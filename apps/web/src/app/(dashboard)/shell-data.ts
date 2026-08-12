import type { Messages } from '@/i18n';

/**
 * What the shell shows before any screen is opened.
 *
 * Figures and ids only — the prose that goes with each row lives in src/i18n,
 * keyed off `key` below. The split matters: a timestamp, a seat count and a
 * branch id are the same in every language, and holding them in three
 * catalogues at once is how two of them end up out of date.
 *
 * The same seam as `dashboard/overview-data.ts`: these constants are what the
 * API will replace, and the call sites are already written for it.
 */

export type NotificationKey = keyof Messages['console']['notification'];
export type PlaceKey = keyof Messages['console']['place'];
export type CityKey = keyof Messages['console']['city'];

export type Notification = {
  key: NotificationKey;
  /** How loudly it asks: high is a decision today, mid is a heads-up. */
  level: 'high' | 'mid';
  time: string;
  place: PlaceKey;
};

export type Branch = {
  id: string;
  /** A venue's name is a proper noun and is not translated. */
  name: string;
  city: CityKey;
  seats: number;
  /** Today's takings, already shortened — the switcher has no room for digits. */
  revenue: string;
};

/** TODO(api): GET /api/v1/notifications — unread first, newest first. */
export const NOTIFICATIONS: readonly Notification[] = [
  { key: 'cash_variance', level: 'high', time: '14:20', place: 'chilonzor' },
  { key: 'deleted_items', level: 'high', time: '13:05', place: 'sergeli' },
  { key: 'beef_low', level: 'mid', time: '11:40', place: 'chilonzor' },
  { key: 'behind_target', level: 'mid', time: '10:15', place: 'termiz' },
];

/**
 * TODO(api): GET /api/v1/branches, and the active one from
 * GET /api/v1/auth/context — that endpoint returns `branch` and
 * `branch_pinned`, which is what decides whether this control is editable.
 */
export const BRANCHES: readonly Branch[] = [
  { id: 'chilonzor', name: 'Chilonzor', city: 'tashkent', seats: 96, revenue: '6.2M' },
  { id: 'yunusobod', name: 'Yunusobod', city: 'tashkent', seats: 74, revenue: '4.8M' },
  { id: 'mirzo', name: "Mirzo Ulug'bek", city: 'tashkent', seats: 60, revenue: '3.5M' },
  { id: 'sergeli', name: 'Sergeli', city: 'tashkent', seats: 48, revenue: '2.4M' },
  { id: 'termiz', name: 'Termiz Markaz', city: 'termiz', seats: 52, revenue: '1.5M' },
];
