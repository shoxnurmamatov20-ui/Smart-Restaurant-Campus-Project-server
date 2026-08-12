import type { ReactNode } from 'react';

import { DEVICES, PLATFORM, TENANTS } from './platform-data';

/**
 * The platform console's navigation.
 *
 * The first group is the design's own — eleven destinations, flat, in its
 * order, with the three counts it puts in the rail. A badge here is not
 * decoration: "3" next to To'lovlar is the reason somebody opens this console
 * before lunch rather than after.
 *
 * The second group is this codebase's. Those screens exist and work; the design
 * simply never drew them, so they are kept reachable and visibly separate
 * rather than deleted or passed off as part of the handoff.
 *
 * Icons are drawn, not typed. The design rules emoji out of the product UI, and
 * this console had a row of them — 📊 🔧 🔐 — which render differently on every
 * platform and, on a screen where someone suspends a restaurant, read as a toy.
 * These are the design's own paths at its 1.75 stroke.
 */
/**
 * `key` names a string in `platform.nav`, not a label. The rail is rendered by
 * a server component that has the catalogue; keeping the words out of this file
 * is what lets the console change language without a second nav definition.
 */
export type AdminNavItem = {
  href: string;
  key: string;
  icon: ReactNode;
  badge?: { text: string; tone: string };
};

const NEUTRAL = 'bg-bg-muted text-fg-muted';
const DANGER = 'bg-danger-50 text-danger-700';
const WARNING = 'bg-warning-50 text-warning-700';

const offline = DEVICES.filter((device) => device.state === 0).length;
const trials = TENANTS.filter((tenant) => tenant.state === 2).length;

export const PLATFORM_NAV: readonly AdminNavItem[] = [
  {
    href: '/dashboard',
    key: 'overview',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="8" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="11" width="7" height="10" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    href: '/tenants',
    key: 'tenants',
    badge: { text: String(PLATFORM.restaurants), tone: NEUTRAL },
    icon: (
      <>
        <path d="M4 21V6.5L11 4v17" />
        <path d="M11 10h6.5A1.5 1.5 0 0 1 19 11.5V21" />
        <path d="M7 9h1" />
        <path d="M7 13h1" />
        <path d="M14.5 14h1.5" />
      </>
    ),
  },
  {
    href: '/plans',
    key: 'plans',
    icon: <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" />,
  },
  {
    href: '/billing',
    key: 'billing',
    badge: { text: String(PLATFORM.paymentIssues), tone: DANGER },
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
        <path d="M16.5 14.5H18" />
      </>
    ),
  },
  {
    href: '/devices',
    key: 'devices',
    badge: { text: String(offline), tone: DANGER },
    icon: (
      <>
        <rect x="4" y="3" width="16" height="13" rx="2" />
        <path d="M9 20h6" />
        <path d="M12 16v4" />
      </>
    ),
  },
  {
    href: '/trials',
    key: 'trials',
    badge: { text: String(trials), tone: WARNING },
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5l3 2" />
      </>
    ),
  },
  {
    href: '/audit',
    key: 'audit',
    icon: (
      <>
        <path d="M12 3 4 6.5v5c0 4.4 3.2 8.3 8 9.5 4.8-1.2 8-5.1 8-9.5v-5z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    href: '/team',
    key: 'team',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
        <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3" />
        <path d="M17.5 14.6c1.9.5 3 2.1 3 4.4" />
      </>
    ),
  },
  {
    href: '/system-health',
    key: 'health',
    icon: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  },
  {
    href: '/logs',
    key: 'logs',
    icon: (
      <>
        <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
        <path d="M14 3v5h5" />
        <path d="M8.5 13h7" />
        <path d="M8.5 17h4" />
      </>
    ),
  },
];

/** The design puts settings alone at the foot of the rail, under a rule. */
export const SETTINGS_ITEM: AdminNavItem = {
  href: '/settings',
  key: 'settings',
  icon: (
    <>
      <path d="M4 8h5" />
      <path d="M13 8h7" />
      <path d="M4 16h9" />
      <path d="M17 16h3" />
      <circle cx="11" cy="8" r="2" />
      <circle cx="15" cy="16" r="2" />
    </>
  ),
};

/** Screens this platform has and the handoff does not. */
export const EXTRA_NAV: readonly AdminNavItem[] = [
  {
    href: '/users',
    key: 'users',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
        <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3" />
        <path d="M17.5 14.6c1.9.5 3 2.1 3 4.4" />
      </>
    ),
  },
  {
    href: '/roles',
    key: 'roles',
    icon: (
      <>
        <path d="M12 3.5 4.5 6.4v5.2c0 4.3 3 8.2 7.5 9.4 4.5-1.2 7.5-5.1 7.5-9.4V6.4z" />
        <path d="m9.2 12 2 2 3.6-3.6" />
      </>
    ),
  },
  {
    href: '/modules',
    key: 'modules',
    icon: (
      <>
        <path d="M21 8.5 12 3.5 3 8.5l9 5 9-5z" />
        <path d="M3 8.5v7l9 5 9-5v-7" />
      </>
    ),
  },
  {
    href: '/integrations',
    key: 'integrations',
    icon: (
      <>
        <path d="M9 3v6" />
        <path d="M15 3v6" />
        <path d="M6 9h12v3a6 6 0 0 1-12 0z" />
        <path d="M12 18v3" />
      </>
    ),
  },
  {
    href: '/telegram',
    key: 'telegram',
    icon: <path d="M21 4 2.5 11.2l5.6 1.9L18 6.5l-7.4 8.1.3 5.4 3-4 4.4 3.1z" />,
  },
  {
    href: '/notifications',
    key: 'notifications',
    icon: (
      <>
        <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
        <path d="M10.3 20a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),
  },
  {
    href: '/statistics',
    key: 'statistics',
    icon: (
      <>
        <path d="M4 4v16h16" />
        <path d="M8 16v-4" />
        <path d="M12.5 16V7.5" />
        <path d="M17 16v-6.5" />
      </>
    ),
  },
  {
    href: '/reports',
    key: 'reports',
    icon: (
      <>
        <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
        <path d="M14 3v5h5" />
        <path d="M8.5 13h7" />
        <path d="M8.5 17h4" />
      </>
    ),
  },
  {
    href: '/api-keys',
    key: 'apiKeys',
    icon: (
      <>
        <circle cx="8" cy="12" r="4" />
        <path d="M12 12h9" />
        <path d="M18 12v3" />
        <path d="M15.5 12v2.5" />
      </>
    ),
  },
  {
    href: '/backups',
    key: 'backups',
    icon: (
      <>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </>
    ),
  },
  {
    href: '/security',
    key: 'security',
    icon: (
      <>
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
];

/**
 * Which `platform.nav` string the top bar shows, keyed by route.
 *
 * Derived from the rail rather than kept beside it, so a screen gets a correct
 * title by existing in the nav — there is no second place to update and forget.
 */
export const PAGE_TITLE_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  [...PLATFORM_NAV, SETTINGS_ITEM, ...EXTRA_NAV].map((item) => [item.href, item.key]),
);
