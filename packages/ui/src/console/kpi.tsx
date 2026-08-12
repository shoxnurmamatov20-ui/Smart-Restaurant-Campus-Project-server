import * as React from 'react';

import { cn } from '@restaurant/utils';

import { CARD } from './panel';

/**
 * The figure a screen opens with, and the rail underneath it.
 *
 * The design is specific about the rail: it carries attainment against a stated
 * target and the caption names which target. That is the whole reason it is
 * allowed to exist — a bar at an invented width is decoration, and decoration
 * beside a number is how a reader learns to distrust the number. A KPI with no
 * target renders no rail rather than a rail at nothing.
 */

/**
 * How a rail or a delta reads. `neutral` is a figure that is neither.
 *
 * `accent` is in the list because the design alternates brand and accent along
 * a KPI row: five rails in one colour read as a single repeated bar rather than
 * five separate measurements.
 */
export type Tone = 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const RAIL_FILL: Record<Tone, string> = {
  brand: 'var(--brand-500)',
  accent: 'var(--accent-500)',
  success: 'var(--success-500)',
  warning: 'var(--warning-500)',
  danger: 'var(--danger-500)',
  neutral: 'var(--n-400)',
};

/**
 * Delta ink.
 *
 * The design's table names `--success-600` and `--danger-600`. The 700 step is
 * used instead because only that one is remapped for dark — 600 keeps its light
 * value there and a green delta on `#12161F` fails contrast. Same intent, the
 * step that survives both themes.
 */
const DELTA_INK: Record<Tone, string> = {
  brand: 'text-fg-brand',
  accent: 'text-accent-700',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
  neutral: 'text-fg-muted',
};

/**
 * A 3px rail carrying attainment against a target.
 *
 * `percent` is clamped rather than trusted: 118% of target is real and worth
 * celebrating, but a bar 18% wider than its track is a layout bug.
 */
export function ProgressRail({
  percent,
  tone = 'brand',
  label,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'role'> & {
  percent: number;
  tone?: Tone;
  /** What the rail measures, for a reader who cannot see it. */
  label: string;
}) {
  const width = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      role="img"
      aria-label={`${label}: ${Math.round(percent)}%`}
      className={cn('bg-bg-muted mt-3.5 h-[3px] overflow-hidden rounded-[2px]', className)}
      {...props}
    >
      <div
        className="h-full rounded-[2px]"
        style={{ width: `${width}%`, background: RAIL_FILL[tone] }}
      />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaTone = 'success',
  attainment,
  railTone = 'brand',
  target,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  label: React.ReactNode;
  /** Already formatted. Formatting is the caller's — it knows the locale. */
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: Tone;
  /** 0–100, or `null` when this figure has no target and gets no rail. */
  attainment?: number | null;
  railTone?: Tone;
  /** Names the target the rail measures against. Required when there is a rail. */
  target?: React.ReactNode;
}) {
  return (
    <div data-slot="kpi" className={cn(CARD, 'px-5 pt-[18px] pb-4', className)} {...props}>
      <div className="text-fg-subtle mb-2.5 text-xs">{label}</div>

      <div data-num className="font-display text-3xl leading-none font-semibold tracking-tight">
        {value}
      </div>

      {unit || delta ? (
        <div data-num className="text-fg-subtle mt-2 text-xs">
          {unit}
          {delta ? (
            <>
              {unit ? ' · ' : null}
              <span className={cn('font-semibold', DELTA_INK[deltaTone])}>{delta}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {attainment !== null && attainment !== undefined && target ? (
        <>
          <ProgressRail percent={attainment} tone={railTone} label={String(target)} />
          <div data-num className="text-fg-subtle text-2xs mt-[7px]">
            {target}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The KPI row.
 *
 * `auto-fit` on a 212px floor rather than a fixed count: the design shows three
 * up on a desktop and five on a wide one, and a hard `grid-cols-3` would leave
 * the accountant's five figures wrapping two-and-two with a gap.
 */
export function KpiRow({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="kpi-row"
      className={cn(
        'mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(212px,1fr))] gap-3.5',
        className,
      )}
      {...props}
    />
  );
}
