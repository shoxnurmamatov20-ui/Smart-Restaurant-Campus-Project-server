import type { ReactNode } from 'react';

import type { Messages } from '@/i18n';
import type { ModuleKey, Role } from '@/lib/roles';

/**
 * Staff console navigation.
 *
 * Twenty-four destinations in four groups and a footer, taken from the design
 * file's own sidebar — service, then the catalogue, then the people, then the
 * money, then settings below a rule. `nav.test.ts` reads this and checks it
 * against the pages that actually exist on disk, which is how a page without a
 * link, or a link without a page, gets caught.
 *
 * **Read from the file, not from the spec.** `specs/01-os.md §3` draws three
 * groups and lists twenty-two rows; `files/Smart Restaurant OS.dc.html` draws
 * four groups and twenty-four, the two extra being the menu board and the
 * complaints queue. The handoff README settles it in a sentence — "Where a
 * document and a file disagree, the file wins and the document is a bug" — and
 * this file was briefly rebuilt from the spec, which cost the Catalogue group
 * and both of those rows. It is rebuilt from the design file now.
 *
 * `href` is separate from `key` because eight of these are views of a module
 * rather than modules of their own: the schedule belongs to Staff, the till and
 * the books to Finance, control and reports to Analytics, complaints to CRM.
 * Nesting them keeps one folder per Phase 1 module instead of inventing nine
 * more top-level routes the API has no counterpart for.
 *
 * Labels are message keys, not strings — the console runs in uz / ru / en and
 * the sidebar is the first thing that has to follow the switch.
 *
 * Icons are the design's own, inlined at its stroke width (1.75 on a 24×24 box)
 * rather than pulled from a package: the sidebar needs two dozen of them and
 * vendoring the subset keeps the client bundle from carrying a whole set.
 * Emoji, which this file used before, are ruled out by the design outright.
 */
export type NavItem = {
  /** Stable id, also the test's handle on the row and the key roles allow by. */
  key: ModuleKey;
  /** Where the row goes. */
  href: string;
  /** Inner SVG, drawn inside a 24×24 box by the shell. */
  icon: ReactNode;
  /** Optional count shown at the end of the row. */
  badge?: string;
  /** A badge that means something is wrong rather than merely counted. */
  badgeTone?: 'warning';
};

export type NavGroup = {
  key: keyof Messages['console']['nav'];
  items: readonly NavItem[];
};

/**
 * The sidebar, section by section, exactly as the design file draws it.
 *
 * Four overlines and a settings footer. The membership and the order are the
 * file's, read off the rail's own DOM rather than off the prose:
 *
 *   OPERATIONS  overview · orders · floor · order intake · kitchen
 *   CATALOGUE   menu · stock · suppliers
 *   PEOPLE      staff · rota · menu board · customers · marketing · website
 *   BUSINESS    finance · stock operations · till · bookkeeping ·
 *               loss prevention · complaints · analytics · reports · branches
 *   footer      settings
 *
 * Two placements look wrong and are the design's: the menu board sits among
 * the people because it is a thing somebody puts on a wall and keeps current,
 * and stock operations sits under Business next to the money it moves rather
 * than beside the stock list it draws from. Both were checked against the file
 * before being copied, because both are the kind of detail a reader "corrects"
 * on the way past.
 *
 * Settings is outside the four: the design puts it below a rule at the foot of
 * the rail, beside the collapse control, because it is not one of the day's
 * jobs.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'sectionOps',
    items: [
      {
        key: 'dashboard',
        href: '/dashboard',
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
        key: 'orders',
        href: '/orders',
        badge: '12',
        icon: (
          <>
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
            <path d="M9.5 8h5" />
            <path d="M9.5 12h5" />
          </>
        ),
      },
      {
        key: 'tables',
        href: '/tables',
        icon: (
          <>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
          </>
        ),
      },
      {
        key: 'calls',
        href: '/calls',
        icon: (
          <>
            {/* A handset over a queue: five channels arriving in one list. */}
            <path d="M5 4h3l1.6 4-2 1.4a12 12 0 0 0 6 6l1.4-2 4 1.6v3a1.6 1.6 0 0 1-1.7 1.6A15.4 15.4 0 0 1 3.4 5.7 1.6 1.6 0 0 1 5 4Z" />
          </>
        ),
      },
      {
        key: 'kitchen',
        href: '/kitchen',
        badge: '7',
        badgeTone: 'warning',
        icon: (
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        ),
      },
    ],
  },
  {
    key: 'sectionCatalogue',
    items: [
      {
        key: 'menu',
        href: '/menu',
        icon: (
          <>
            <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z" />
            <path d="M12 6.5v13" />
          </>
        ),
      },
      {
        key: 'inventory',
        href: '/inventory',
        badge: '4',
        icon: (
          <>
            <path d="M21 8.5 12 3.5 3 8.5l9 5 9-5z" />
            <path d="M3 8.5v7l9 5 9-5v-7" />
          </>
        ),
      },
      {
        key: 'suppliers',
        href: '/suppliers',
        icon: (
          <>
            <path d="M3 7h11v9H3z" />
            <path d="M14 10h4l3 3v3h-7" />
            <circle cx="7" cy="18" r="1.8" />
            <circle cx="17" cy="18" r="1.8" />
          </>
        ),
      },
    ],
  },
  {
    key: 'sectionPeople',
    items: [
      {
        key: 'staff',
        href: '/staff',
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
        key: 'shifts',
        href: '/staff/shifts',
        icon: (
          <>
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
          </>
        ),
      },
      {
        key: 'board',
        href: '/board',
        icon: (
          <>
            {/* A screen on a stand: the menu board hangs above the counter. */}
            <rect x="3" y="4" width="18" height="11" rx="1.5" />
            <path d="M12 15v4" />
            <path d="M8.5 19h7" />
          </>
        ),
      },
      {
        key: 'crm',
        href: '/crm',
        icon: (
          <>
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
            <circle cx="9" cy="11" r="2.2" />
            <path d="M5.8 16.4c.5-1.5 1.7-2.3 3.2-2.3s2.7.8 3.2 2.3" />
            <path d="M15.5 10h3.2" />
            <path d="M15.5 13.5h3.2" />
          </>
        ),
      },
      {
        key: 'marketing',
        href: '/marketing',
        icon: (
          <>
            {/* A megaphone — campaigns going out, not a chart coming back. */}
            <path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1Z" />
            <path d="M16 8.5a5 5 0 0 1 0 7" />
            <path d="M19 6a9 9 0 0 1 0 12" />
          </>
        ),
      },
      {
        key: 'web',
        href: '/web',
        icon: (
          <>
            {/* A globe: the restaurant's own site, seen from outside. */}
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
          </>
        ),
      },
    ],
  },
  {
    key: 'sectionMoney',
    items: [
      {
        key: 'finance',
        href: '/finance',
        icon: (
          <>
            <rect x="3" y="6" width="18" height="13" rx="2.5" />
            <path d="M3 10h18" />
            <path d="M16.5 14.5h1.5" />
          </>
        ),
      },
      {
        key: 'stockOps',
        href: '/inventory/operations',
        icon: (
          <>
            <path d="M4 7.5 12 3.5l8 4v9L12 20.5 4 16.5z" />
            <path d="M4 7.5 12 11.5l8-4" />
            <path d="M12 11.5v9" />
          </>
        ),
      },
      {
        key: 'till',
        href: '/finance/till',
        icon: (
          <>
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <path d="M3 12h18" />
            <path d="M7.5 4h9l1.5 4H6z" />
          </>
        ),
      },
      {
        key: 'books',
        href: '/finance/books',
        icon: (
          <>
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v12.5a1.5 1.5 0 0 1-1.5 1.5H6a2 2 0 0 1-2-2z" />
            <path d="M8 8.5h7" />
            <path d="M8 12h7" />
            <path d="M8 15.5h4" />
          </>
        ),
      },
      {
        key: 'control',
        href: '/analytics/control',
        icon: (
          <>
            <path d="M12 3.5 4.5 6.4v5.2c0 4.3 3 8.2 7.5 9.4 4.5-1.2 7.5-5.1 7.5-9.4V6.4z" />
            <path d="M12 9v3.5" />
            <path d="M12 15.6h.01" />
          </>
        ),
      },
      {
        key: 'cases',
        href: '/crm/cases',
        badge: '3',
        badgeTone: 'warning',
        icon: (
          <>
            {/* A speech bubble with a raised point — a complaint, not a chat. */}
            <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5Z" />
            <path d="M12 8.5v3.5" />
            <path d="M12 15.2v.1" />
          </>
        ),
      },
      {
        key: 'analytics',
        href: '/analytics',
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
        key: 'reports',
        href: '/analytics/reports',
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
        key: 'branches',
        href: '/settings/branches',
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
    ],
  },
];

/**
 * Settings, which sits below the sections rather than inside one.
 *
 * `specs/01-os.md §3`: a rule, then settings and the collapse control. Kept out
 * of `NAV_GROUPS` so no section can accidentally claim it and so the shell can
 * render the footer without slicing the last group.
 */
export const NAV_FOOTER: NavItem = {
  key: 'settings',
  href: '/settings',
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

export const NAV_ITEMS: readonly NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  /* Settings is a destination like any other; only its placement differs. */
  NAV_FOOTER,
];

/**
 * Settings, for the roles that hold it.
 *
 * Mirrors `navGroupsFor` rather than being folded into it, because the design
 * puts this row outside the sections — below a rule, beside the collapse
 * control. A role without `settings` gets no footer at all rather than an empty
 * rule, which is what a waiter's rail should look like.
 */
export function navFooterFor(role: Role): NavItem | null {
  return role.nav.includes(NAV_FOOTER.key) ? NAV_FOOTER : null;
}

/**
 * The sidebar this role actually gets.
 *
 * Rows the role does not hold are dropped, and a section left with no rows is
 * dropped with them — an overline over nothing reads as a loading failure. The
 * warehouse keeper sees *Katalog* and *Biznes* with two rows between them, not
 * four empty headings.
 *
 * Filtering, never reordering: the sections stay in their designed order so a
 * manager and an owner find *Ombor* in the same place, and someone who works
 * two roles is not relearning the sidebar each shift.
 *
 * Presentation only. The row a role cannot see is a row not drawn — the API
 * refuses the request either way, and `TenantIsolationTest` is what proves it.
 */
/**
 * The four counts the sidebar wears, by the item they belong to.
 *
 * From `GET /api/v1/dashboard/pulse`. Null is the fixture console, which
 * keeps the design's own badges; a live tenant gets its counts, and an item
 * whose count is zero gets no badge at all — a grey "0" beside "Orders" is
 * a badge that says nothing, which is the one thing a badge must not do.
 */
export type NavCounts = {
  orders: number;
  kitchen: number;
  inventory: number;
  cases: number;
} | null;

export function navGroupsFor(role: Role, counts: NavCounts = null): readonly NavGroup[] {
  const allowed = new Set<ModuleKey>(role.nav);

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.key)).map((item) => badged(item, counts)),
  })).filter((group) => group.items.length > 0);
}

function badged(item: NavItem, counts: NavCounts): NavItem {
  if (counts === null) return item;

  const count = COUNTED[item.key];

  if (count === undefined) return item;

  const value = count(counts);
  const rest: NavItem = { ...item };
  delete rest.badge;

  return value > 0 ? { ...rest, badge: String(value) } : rest;
}

const COUNTED: Partial<Record<ModuleKey, (counts: NonNullable<NavCounts>) => number>> = {
  orders: (counts) => counts.orders,
  kitchen: (counts) => counts.kitchen,
  inventory: (counts) => counts.inventory,
  cases: (counts) => counts.cases,
};
