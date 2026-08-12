import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The shapes every platform screen is built from.
 *
 * The design gives this console one page head, one card, one table head and one
 * empty state. Writing those once and importing them is what keeps thirty-odd
 * screens looking like one product rather than thirty attempts at it.
 *
 * The title itself is not here: it lives in the top bar, derived from the
 * route. What a page contributes is the sentence under it.
 */

export const CARD = 'bg-surface rounded-lg border';
export const H3 = 'text-md font-semibold tracking-snug';
export const ACTION =
  'bg-surface hover:bg-bg-subtle flex h-9 items-center rounded-md border px-3.5 text-sm font-medium';
export const ACTION_PRIMARY =
  'bg-brand-500 hover:bg-brand-600 flex h-9 items-center rounded-md px-3.5 text-sm font-semibold text-white';

/** The line under the top bar's title, with whatever actions the page offers. */
export function PageIntro({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div data-pagehead className="mb-[18px] flex items-center justify-between gap-4">
      <p className="text-fg-muted text-sm">{children}</p>
      {actions ? <div className="flex flex-none gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The strip of figures a screen opens on.
 *
 * One bordered box divided into cells, not four separate cards: the figures are
 * one reading, and separating them invites the eye to compare each against
 * nothing.
 *
 * A cell with no data shows an em dash in the disabled colour rather than a
 * zero. "0 failed logins" and "we are not measuring failed logins" are
 * different facts, and only one of them is reassuring.
 */
export function StatStrip({
  stats,
  wide,
}: {
  stats: readonly { label: string; value: string; tone?: string }[];
  wide?: boolean;
}) {
  return (
    <div
      className={`${CARD} mb-5 grid overflow-hidden ${
        wide
          ? '[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]'
          : '[grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]'
      }`}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="border-divider border-r px-[22px] py-5 last:border-r-0">
          <div className="text-fg-subtle mb-2.5 text-xs">{stat.label}</div>
          <div
            data-num
            className={`font-display text-2xl font-semibold tracking-tight ${
              stat.tone ?? (stat.value === '—' ? 'text-fg-disabled' : '')
            }`}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A screen that is designed but not built.
 *
 * Drawn as an honest placeholder rather than a blank page or a fake table: it
 * says what will be here and what it waits on, so nobody mistakes an unbuilt
 * screen for a broken one — or for a finished one with no data.
 */
export function Stub({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`${CARD} px-8 py-14 text-center`}>
      <div className="text-fg-disabled mx-auto mb-4 grid size-11 place-items-center rounded-md border">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="M3.5 9.5h17" />
          <path d="M8 14h8" />
        </svg>
      </div>

      <div className="text-sm font-semibold">{title}</div>
      {children ? (
        <p className="text-fg-subtle mx-auto mt-1.5 max-w-[420px] text-xs leading-normal">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** The tab strip the settings screens share. */
export function Tabs({
  items,
  current,
}: {
  items: readonly { href: string; label: string }[];
  current: string;
}) {
  return (
    <nav className="mb-5 flex gap-1 border-b">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`-mb-px border-b-2 px-3.5 pt-2.5 pb-3 text-sm font-medium ${
            item.href === current ? 'border-brand-500 text-fg' : 'text-fg-muted border-transparent'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
