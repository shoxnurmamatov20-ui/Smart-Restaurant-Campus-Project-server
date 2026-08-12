import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * The console's tabular data.
 *
 * A real `<table>`, not a grid of divs. Branch performance, the tenant list and
 * the per-employee risk table are all genuinely tabular — a reader navigating
 * by keyboard or screen reader needs the row and column relationships that only
 * table semantics carry, and the dashboard's flex rows are the right shape only
 * for lists that happen to have columns.
 *
 * Horizontal scroll rather than squeezing: below the design's 1080px floor the
 * columns stop being readable, and a table scrolled inside its own box is
 * better than a page that scrolls sideways. `[data-table]` is the hook
 * app-shell.css paints that with.
 *
 * Named `DataTable` because `Table` is already taken by the shadcn primitive in
 * ../components/table.tsx, which is the unstyled Radix-adjacent one.
 */
export function DataTable({
  className,
  minWidth,
  children,
  ...props
}: React.ComponentProps<'table'> & {
  /** Below this the box scrolls. Defaults to the design's 1080px floor. */
  minWidth?: number;
}) {
  return (
    <div data-table data-slot="data-table">
      <table
        className={cn('w-full border-collapse text-sm', className)}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

/**
 * A sticky header row.
 *
 * Sticky against the scrolling `main`, so a long tenant list keeps its column
 * names in view. The background is opaque on purpose — a translucent header
 * lets rows show through as they pass under it.
 */
export function DataHead({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="data-head"
      className={cn('bg-surface sticky top-0 z-10', className)}
      {...props}
    />
  );
}

export function DataTh({
  align = 'left',
  className,
  ...props
}: React.ComponentProps<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      data-slot="data-th"
      className={cn(
        'text-fg-subtle tracking-caps text-2xs border-b px-3 pt-0 pb-2.5 font-semibold whitespace-nowrap uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function DataTr({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-row
      data-slot="data-tr"
      className={cn('border-b last:border-0', className)}
      {...props}
    />
  );
}

export function DataTd({
  align = 'left',
  numeric = false,
  className,
  ...props
}: React.ComponentProps<'td'> & { align?: 'left' | 'right' | 'center'; numeric?: boolean }) {
  return (
    <td
      data-num={numeric ? '' : undefined}
      data-slot="data-td"
      className={cn(
        'px-3 py-3 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A proportion drawn inside a table cell — margin, attainment, risk.
 *
 * Takes its colour from the caller because the thresholds differ per table:
 * loss prevention turns a bar red above 60, a margin bar is brand throughout.
 * The number stays beside it; the bar is the comparison, not the value.
 */
export function CellBar({
  percent,
  fill,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  percent: number;
  /** A CSS colour — pass a token, not a hex. */
  fill: string;
  label: string;
}) {
  const width = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      role="img"
      aria-label={`${label}: ${Math.round(percent)}%`}
      className={cn('bg-bg-muted h-1.5 w-full overflow-hidden rounded-[2px]', className)}
      {...props}
    >
      <div className="h-full rounded-[2px]" style={{ width: `${width}%`, background: fill }} />
    </div>
  );
}
