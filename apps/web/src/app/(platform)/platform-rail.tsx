'use client';

import Link from 'next/link';

import { useLocalePath } from '@/lib/use-locale-path';

import { PLATFORM_NAV } from './platform-nav';

/**
 * The rail itself.
 *
 * Client only because the active row is decided by the URL, and the pathname is
 * the honest way to know it — deriving it on the server would mean threading the
 * path through the layout, which Next does not hand out.
 *
 * `/platform` matches exactly. Every other row matches as a prefix, so
 * `/platform/tenants/smart` keeps Restaurants lit; without the special case the
 * overview would be active on all twelve screens.
 *
 * `here` and `to()` rather than `usePathname()` directly, since the language
 * became a real segment: the address bar says `/uz/platform/tenants` while
 * these rows are written as `/platform/tenants`, so a raw comparison is false
 * on every screen. It fails silently — nothing throws, no row lights up, and
 * `aria-current` leaves the rail entirely, which on the 76px icon rail below
 * 1200px means an operator has nothing at all telling them where they are.
 * `to()` on the href keeps a click in the language being read instead of
 * bouncing through the middleware.
 */
export function PlatformRail({ labels }: { labels: Record<string, string> }) {
  const { here, to } = useLocalePath();

  const isActive = (href: string) =>
    href === '/platform' ? here === '/platform' : here.startsWith(href);

  /*
   * `min-h-0` beside `flex-1`: a column flex item will not shrink below its
   * content without it, so the rail grew past the sidebar instead of scrolling
   * inside it — and the rows, which had nothing holding their height, were
   * squeezed from 40px down to 23.
   */
  return (
    <nav data-scroll className="flex min-h-0 flex-1 flex-col gap-0.5 px-3 py-4">
      {PLATFORM_NAV.map((group, index) => (
        <div key={group.key} className="contents">
          <div
            data-navsection
            className={`text-2xs tracking-caps text-fg-subtle px-2.5 pb-1.5 font-semibold uppercase ${
              index === 0 ? 'pt-2' : 'pt-[18px]'
            }`}
          >
            {labels[`group_${group.key}`]}
          </div>

          {group.items.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.key}
                href={to(item.href)}
                data-navitem
                data-active={active ? 'true' : undefined}
                aria-current={active ? 'page' : undefined}
                data-press
                className="text-fg-muted flex h-10 flex-none items-center gap-3 rounded-md px-2.5 text-sm font-medium"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-none"
                  aria-hidden
                >
                  {item.icon}
                </svg>
                <span data-navlabel className="truncate">
                  {labels[item.key]}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
