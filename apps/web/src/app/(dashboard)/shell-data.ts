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
  /**
   * How loudly it asks.
   *
   * `high` is a decision today, `mid` is a heads-up, `low` is a fact. The
   * design paints them danger, warning and brand, which is why a third level
   * had to exist: a completed P&L in the same red as a cash variance teaches a
   * reader to stop trusting the red.
   */
  level: 'high' | 'mid' | 'low';
  time: string;
  place: PlaceKey;
  /** Where the row goes when it is pressed — a route in this console. */
  href: string;
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

/**
 * The design's six sample rows, and what is behind them now.
 *
 * The tray is live: `notificationFeed()` in ./notifications-server.ts reads
 * `GET /api/v1/notifications`, and these are what a console with no session —
 * or one whose API is mid-restart — draws instead.
 *
 * `public.notifications` exists (migration `2026_08_22_180000`) and four things
 * write into it: a flagged cash variance, a sale the fiscal window closed on, a
 * void at a till, and an approval a manager has not answered. Only the first
 * shares a key with this list; the other three are `fiscal_expired`,
 * `bill_voided` and `approval_waiting`, which sit beside these six in the
 * catalogue.
 *
 * The other five keys here still have no producer, and each is missing a
 * different thing rather than the same thing five times: `deleted_items` wants
 * an item-level void, where Pos publishes whole-bill ones; `beef_low` wants a
 * stock threshold Inventory does not raise; and `behind_target`, `july_pl` and
 * `no_show` are a target check, a report run and an attendance sweep, none of
 * which is an event on this platform yet.
 *
 * The ordering rule moved to the server with the rows and is worth restating,
 * because it is the one thing about this list that reads like a bug: severity
 * first, clock second, and not merely newest first. Two of these end with
 * somebody being short of money at the end of a shift, and they belong at the
 * top of the tray at 09:00 the next morning. It now lives in
 * `NotificationController::SEVERITY_FIRST`.
 *
 * The alternative that was checked and rejected stays recorded rather than
 * re-argued: `GET /api/v1/dashboard` answers `attention[]`
 * (`RoleDashboards::attention()`), which is a rules engine over today's figures
 * — five thresholds carrying no time, no place and no read state, and already
 * drawn in its own panel on the dashboard. Wiring it here would have put the
 * same four cards in two places and called one of them a notification.
 */
export const NOTIFICATIONS: readonly Notification[] = [
  {
    key: 'cash_variance',
    level: 'high',
    time: '14:20',
    place: 'chilonzor',
    href: '/analytics/control',
  },
  {
    key: 'deleted_items',
    level: 'high',
    time: '13:05',
    place: 'sergeli',
    href: '/analytics/control',
  },
  { key: 'beef_low', level: 'mid', time: '11:40', place: 'chilonzor', href: '/inventory' },
  {
    key: 'behind_target',
    level: 'mid',
    time: '10:15',
    place: 'termiz',
    href: '/settings/branches',
  },
  { key: 'july_pl', level: 'low', time: '09:00', place: 'head_office', href: '/analytics/reports' },
  { key: 'no_show', level: 'low', time: '08:30', place: 'yunusobod', href: '/staff' },
];

/**
 * The demo console's five venues.
 *
 * The live switcher reads the restaurant's own in the sibling
 * `shell-server.ts` — `GET /api/v1/branches` joined to
 * `GET /api/v1/auth/context`, whose `branch` and `branch_pinned` decide which
 * venue is current and whether the control opens at all. These rows are what a
 * console with no session, or one whose API is mid-restart, draws instead.
 *
 * Choosing a venue does not yet narrow the screens; see `BranchSwitcher` in
 * `shell-client.tsx` for what the remaining half needs, which is a cookie and
 * an `X-Branch` header in two shared modules rather than anything on the server.
 */
export const BRANCHES: readonly Branch[] = [
  { id: 'chilonzor', name: 'Chilonzor', city: 'tashkent', seats: 96, revenue: '6.2M' },
  { id: 'yunusobod', name: 'Yunusobod', city: 'tashkent', seats: 74, revenue: '4.8M' },
  { id: 'mirzo', name: "Mirzo Ulug'bek", city: 'tashkent', seats: 60, revenue: '3.5M' },
  { id: 'sergeli', name: 'Sergeli', city: 'tashkent', seats: 48, revenue: '2.4M' },
  { id: 'termiz', name: 'Termiz Markaz', city: 'termiz', seats: 52, revenue: '1.5M' },
];
