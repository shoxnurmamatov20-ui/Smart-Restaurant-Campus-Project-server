import type { ReactNode } from 'react';

/**
 * The handful of shapes the twelve platform screens share.
 *
 * Small on purpose. The restaurant console has `packages/ui` and a `screen.tsx`
 * of its own; the platform is a different product for a different person and
 * borrowing the console's KPI card wholesale would drift the moment either
 * changes. These are the ones eleven screens genuinely repeat.
 *
 * They are also where this console's whole visual argument lives, because every
 * screen draws through them: change a table here and twelve screens move
 * together. See `platform.css` for what the argument is — in one line, colour
 * marks the exception and nothing else, so a healthy screen is entirely
 * graphite and the three restaurants that need somebody are the only things on
 * it wearing a tone.
 *
 * The API has not moved. Every prop these took before, they still take, because
 * twelve screens pass them and a rename would have been a rewrite of all twelve
 * for no gain.
 */
export function Head({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5">
      <div className="min-w-0">
        {/* Large, tight, and alone: the rail already says which screen this is,
            so there is no eyebrow above it restating the heading. */}
        <h2 data-ptitle className="font-display">
          {title}
        </h2>
        {subtitle ? <p className="text-fg-muted mt-2 text-sm">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-none flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export type StatTone = 'success' | 'warning' | 'danger';

/**
 * The figures across the top of a screen.
 *
 * One panel with hairlines between, not six bordered cards. A card is for a
 * thing you act on; these are things you read, and boxing each one separately
 * made a row of identical frames whose contents had to be taken one at a time.
 * On a single panel the values share a baseline and the eye compares them.
 *
 * `success` deliberately paints nothing. A figure that is fine is a figure with
 * no work behind it, and this console spends colour only on work.
 */
export function Stats({
  items,
}: {
  items: readonly { label: string; value: string; note?: string; tone?: StatTone }[];
}) {
  const ink: Record<StatTone, string> = {
    success: '',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
  };

  return (
    <dl data-group data-figures className="mb-5">
      {items.map((item) => (
        <div key={item.label} data-figure>
          <dt>{item.label}</dt>
          <dd data-num className={`font-display ${item.tone ? ink[item.tone] : ''}`}>
            {item.value}
          </dd>
          {item.note ? <div data-note>{item.note}</div> : null}
        </div>
      ))}
    </dl>
  );
}

export type Column = { label: string; align?: 'right' };

/**
 * A list, which on most of these screens is the screen.
 *
 * The panel carries the corner and the fill; the separators are drawn in CSS as
 * an inset background on each cell, so they begin under the text rather than at
 * the panel's edge. That is the difference between a list with rows in it and a
 * panel sliced into strips.
 */
export function Table({ head, children }: { head: readonly Column[]; children: ReactNode }) {
  return (
    <div data-group data-table className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            {head.map((column, index) => (
              <th
                key={`${column.label}-${index}`}
                scope="col"
                className={column.align === 'right' ? 'text-right' : 'text-left'}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function Td({
  children,
  align,
  numeric,
  className = '',
}: {
  children?: ReactNode;
  align?: 'right';
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      data-num={numeric ? '' : undefined}
      className={`${align === 'right' ? 'text-right' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

export type ChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

/**
 * A bounded label.
 *
 * Two of the five tones carry no colour at all, and that is the point rather
 * than an oversight:
 *
 *   - `brand` is a fact about a row — a plan name, a kind, a version. Facts are
 *     not states, and a tinted pill for one competes with the pill three
 *     columns over that means "this account has stopped paying".
 *   - `success` is a state, but the state is "nothing to do". It keeps a green
 *     dot so the reading is unambiguous where a screen genuinely reports health,
 *     and loses the fill so it does not ask to be looked at.
 *
 * `warning` and `danger` keep theirs. They are the only things on a healthy
 * screen that would be wearing a tone, which is exactly how they get found.
 */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  const style: Record<ChipTone, string> = {
    neutral: 'text-fg-muted',
    brand: 'bg-bg-muted text-fg',
    success: 'bg-bg-muted text-fg-muted',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
  };

  const dotted = tone === 'success' || tone === 'warning' || tone === 'danger';

  return (
    <span
      className={`rounded-pill text-2xs inline-flex items-center gap-1.5 px-2.5 py-1 font-semibold ${style[tone]}`}
    >
      {dotted ? <span data-dot={tone} aria-hidden /> : null}
      {children}
    </span>
  );
}

/**
 * A proportion.
 *
 * Thinner than the design's 5px and fully rounded, because at this size a bar
 * with square ends reads as a fragment of a longer one. Neutral and brand fills
 * are graphite and accent; the three state fills are here because a share of
 * something failing is one of the few proportions on this console worth a tone.
 */
export function Rail({ percent, tone }: { percent: number; tone: ChipTone }) {
  const fill: Record<ChipTone, string> = {
    neutral: 'bg-n-300',
    brand: 'bg-brand-500',
    success: 'bg-n-400',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  };

  return (
    <span className="bg-bg-muted rounded-pill block h-1 overflow-hidden">
      <span
        className={`rounded-pill block h-full ${fill[tone]}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}
