import type { ReactNode } from 'react';

/**
 * The platform operator's own navigation — `specs/01-os.md §6`.
 *
 * "12 screens, own navigation, own sidebar. The platform operator is **not** a
 * restaurant employee." This surface shipped with one screen and a header, and
 * the layout's own docblock argued for it: *no sidebar, no branch switcher*.
 * The first half of that reasoning is right — a super admin is not a very
 * privileged owner — and the conclusion drawn from it was wrong. They are not
 * given the restaurant's sidebar; they are given their own.
 *
 * Twelve rows in three groups. The grouping is this file's, not the design's,
 * which draws them as one list: at twelve rows an ungrouped rail is a list
 * somebody scans rather than reaches into, and the three groups answer three
 * different questions — who the customers are, whether the money arrived, and
 * whether the platform is standing up.
 */
export type PlatformNavItem = {
  key: string;
  href: string;
  icon: ReactNode;
};

export type PlatformNavGroup = {
  key: 'customers' | 'money' | 'platform';
  items: readonly PlatformNavItem[];
};

export const PLATFORM_NAV: readonly PlatformNavGroup[] = [
  {
    key: 'customers',
    items: [
      {
        key: 'overview',
        href: '/platform',
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
        key: 'tenants',
        href: '/platform/tenants',
        icon: (
          <>
            <path d="M4 20V9l5-4 5 4v11" />
            <path d="M14 20V12h6v8" />
            <path d="M2.5 20h19" />
          </>
        ),
      },
      {
        key: 'trials',
        href: '/platform/trials',
        icon: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 1.8" />
          </>
        ),
      },
      {
        key: 'terminals',
        href: '/platform/terminals',
        icon: (
          <>
            <rect x="2.5" y="6" width="19" height="12.5" rx="1.8" />
            <path d="m8 3 4 3 4-3" />
          </>
        ),
      },
    ],
  },
  {
    key: 'money',
    items: [
      {
        key: 'plans',
        href: '/platform/plans',
        icon: (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
          </>
        ),
      },
      {
        key: 'billing',
        href: '/platform/billing',
        icon: (
          <>
            <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
            <path d="M9 9h6" />
            <path d="M9 13h6" />
          </>
        ),
      },
      {
        key: 'subscription',
        href: '/platform/subscription',
        icon: (
          <>
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v4h-4" />
          </>
        ),
      },
    ],
  },
  {
    key: 'platform',
    items: [
      {
        key: 'health',
        href: '/platform/health',
        icon: (
          <>
            <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
          </>
        ),
      },
      {
        key: 'signIns',
        href: '/platform/sign-ins',
        icon: (
          <>
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
          </>
        ),
      },
      {
        key: 'team',
        href: '/platform/team',
        icon: (
          <>
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
            <path d="M16 11a3 3 0 1 0 0-6" />
            <path d="M18 20c0-2.4-.9-4.2-2.4-5.3" />
          </>
        ),
      },
      {
        key: 'log',
        href: '/platform/log',
        icon: (
          <>
            <path d="M4 5h16" />
            <path d="M4 12h16" />
            <path d="M4 19h10" />
          </>
        ),
      },
      {
        key: 'settings',
        href: '/platform/settings',
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
      },
    ],
  },
];

/** Every row, flat — the test's handle, and how a title is looked up. */
export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] = PLATFORM_NAV.flatMap(
  (group) => group.items,
);
