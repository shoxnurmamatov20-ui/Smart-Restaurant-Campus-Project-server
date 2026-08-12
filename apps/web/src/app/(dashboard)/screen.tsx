import type { ReactNode } from 'react';

/**
 * The pieces every module screen is made of.
 *
 * The design draws the same three things on nearly every page — a 24px heading
 * over a muted line with actions opposite, a card holding a grid of rows, and a
 * tinted pill for state — at the same measurements each time. Writing them once
 * is not tidiness: it is the only way nineteen screens stay the same product
 * when they are built weeks apart.
 *
 * Deliberately thin. Each screen still declares its own column widths, because
 * those are the design's per-screen decisions and hiding them behind a prop
 * would lose the thing that makes each table readable.
 */

/** A page's opening: title, one muted line, and the actions on the right. */
export function PageHead({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p> : null}
      </div>

      {children ? (
        <div data-pageactions className="flex flex-none gap-2.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A bordered action. The design gives a screen at most one filled button. */
export const ACTION =
  'bg-surface hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-medium whitespace-nowrap';

export const ACTION_PRIMARY =
  'bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-3.5 text-sm font-semibold whitespace-nowrap text-white';

/**
 * A table, as this design does tables: a card with a tinted header strip and
 * hairline-separated rows, scrolling inside itself rather than widening the
 * page.
 *
 * `columns` is a Tailwind arbitrary grid-template, written out by the screen —
 * `[grid-template-columns:minmax(0,1.6fr)_150px_110px]` and so on.
 */
export function TableCard({
  columns,
  head,
  children,
  className = '',
}: {
  columns: string;
  head: readonly (string | { label: string; align: 'right' })[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-table className={`bg-surface overflow-hidden rounded-lg border ${className}`}>
      <div
        className={`bg-bg-subtle text-fg-subtle grid ${columns} gap-4 border-b px-5 py-[11px] text-xs font-semibold tracking-wide`}
      >
        {head.map((column, index) => {
          const label = typeof column === 'string' ? column : column.label;
          const right = typeof column === 'string' ? false : column.align === 'right';

          return (
            <span key={`${label}-${index}`} className={right ? 'text-right' : undefined}>
              {label}
            </span>
          );
        })}
      </div>

      {children}
    </div>
  );
}

/** One row of a TableCard. */
export function Row({
  columns,
  children,
  className = 'py-3.5',
}: {
  columns: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-row
      className={`border-divider grid ${columns} items-center gap-4 border-b px-5 ${className}`}
    >
      {children}
    </div>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral';

const TONES: Record<Tone, string> = {
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  brand: 'bg-brand-50 text-brand-700',
  neutral: 'bg-bg-muted text-fg-muted',
};

/** A state, said in a word and a tint — never in a tint alone. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`rounded-pill text-2xs inline-flex items-center px-[9px] py-1 font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** The four-figure strip several screens put above their table. */
export function StatStrip({
  stats,
}: {
  stats: readonly { label: string; value: string; tone?: 'warning' }[];
}) {
  return (
    <div className="bg-surface mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] overflow-hidden rounded-lg border">
      {stats.map((stat) => (
        <div key={stat.label} className="border-divider px-[22px] py-[18px] not-last:border-r">
          <div className="text-fg-subtle mb-2 text-xs">{stat.label}</div>
          <div
            data-num
            className={`font-display text-2xl font-semibold tracking-tight ${
              stat.tone === 'warning' ? 'text-warning-700' : ''
            }`}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Someone's initials, as the design draws them beside a name. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <span className="bg-bg-muted text-fg-muted rounded-pill grid size-8 flex-none place-items-center text-xs font-semibold">
      {initials}
    </span>
  );
}

/** A proportion, drawn as the design's 5px rail. */
export function Rail({ percent, colour }: { percent: number; colour: string }) {
  return (
    <span className="bg-bg-muted block h-[5px] overflow-hidden rounded-[3px]">
      <span
        className="block h-full rounded-[3px]"
        style={{ width: `${Math.min(100, percent)}%`, background: colour }}
      />
    </span>
  );
}
