import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * The three marks the console draws, hand-built.
 *
 * No charting library. A donut of four slices, a row of twelve bars and a
 * twelve-point line do not need one; it would ship a hundred kilobytes to draw
 * them; and — the real reason — a library owns its own palette, its own easing
 * and its own idea of a gridline, which is precisely what a design system
 * exists to prevent. The design's restraint is the specification: no gridlines,
 * no legend where a label will do, no 3D, no gradient fills.
 *
 * Every measurement below is the prototype's own.
 */

/* ------------------------------------------------------------------ donut -- */

/**
 * The circumference the design's donut is drawn against.
 *
 * 132px box, 18px stroke, so the stroke's centreline sits at r = 52 and
 * 2πr = 326.73. Segments are `stroke-dasharray` runs along that length, which
 * is why the number is a constant rather than something computed per render.
 */
const DONUT_R = 52;
const DONUT_C = 2 * Math.PI * DONUT_R;

export type Slice = {
  key: string;
  label: React.ReactNode;
  value: number;
  /** A CSS colour. Pass a token — `var(--brand-500)` — not a hex. */
  colour: string;
  /** What to print beside the name. Omit and the share is shown alone. */
  display?: React.ReactNode;
};

/**
 * A donut with its total in the middle and its legend underneath.
 *
 * `stroke-linecap: butt` and a −90° rotation, both from the design: a round cap
 * makes a 3% slice look like 6% and starting anywhere but noon makes two donuts
 * on one screen impossible to compare.
 *
 * The legend prints a value *and* a share, and the design is explicit that it
 * must never print the same number twice — a row reading `18 · 18%` teaches the
 * reader nothing on its second half.
 */
export function Donut({
  slices,
  total,
  totalLabel,
  size = 132,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  slices: readonly Slice[];
  /** Printed in the middle. Already formatted. */
  total: React.ReactNode;
  totalLabel: React.ReactNode;
  size?: number;
}) {
  const sum = slices.reduce((running, slice) => running + slice.value, 0);

  // Each segment starts where the previous one ended, which is what
  // `strokeDashoffset` counts backwards from. Derived per slice from what came
  // before it rather than carried in a running total: an accumulator reassigned
  // inside a render body is exactly what the compiler cannot reason about, and
  // with at most a handful of slices the second pass costs nothing.
  const runs = slices.map((slice, index) => {
    const before = slices.slice(0, index).reduce((running, past) => running + past.value, 0);
    const length = sum > 0 ? (slice.value / sum) * DONUT_C : 0;
    const offset = sum > 0 ? -(before / sum) * DONUT_C : 0;

    return {
      ...slice,
      share: sum > 0 ? Math.round((slice.value / sum) * 100) : 0,
      dash: `${length.toFixed(2)} ${(DONUT_C - length).toFixed(2)}`,
      offset: offset.toFixed(2),
    };
  });

  return (
    <div data-slot="donut" className={cn('flex flex-col items-center', className)} {...props}>
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 132 132"
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`${totalLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}
        >
          <circle
            cx="66"
            cy="66"
            r={DONUT_R}
            fill="none"
            stroke="var(--bg-muted)"
            strokeWidth="18"
          />
          {runs.map((run) => (
            <circle
              key={run.key}
              cx="66"
              cy="66"
              r={DONUT_R}
              fill="none"
              stroke={run.colour}
              strokeWidth="18"
              strokeLinecap="butt"
              strokeDasharray={run.dash}
              strokeDashoffset={run.offset}
            />
          ))}
        </svg>

        <div className="absolute inset-0 grid place-content-center text-center">
          <div data-num className="font-display text-2xl leading-none font-bold tracking-tight">
            {total}
          </div>
          <div className="text-fg-subtle text-2xs mt-1">{totalLabel}</div>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-col gap-2">
        {runs.map((run) => (
          <div key={run.key} className="flex items-center gap-2.5 text-xs">
            <span
              aria-hidden
              className="rounded-pill size-2 flex-none"
              style={{ background: run.colour }}
            />
            <span className="text-fg-muted min-w-0 flex-1 truncate">{run.label}</span>
            <span data-num className="text-fg flex-none font-semibold">
              {run.display ?? run.value}
            </span>
            <span data-num className="text-fg-subtle w-9 flex-none text-right">
              {run.share}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- bars -- */

export type Bar = {
  key: string;
  label: React.ReactNode;
  value: number;
  /** `past` is the default; `current` is now; `over` has crossed a threshold. */
  state?: 'past' | 'current' | 'over';
};

const BAR_FILL: Record<NonNullable<Bar['state']>, string> = {
  past: 'var(--brand-200)',
  current: 'var(--brand-500)',
  over: 'var(--warning-500)',
};

/**
 * A row of bars, sized in pixels.
 *
 * The design says this outright and it is the one thing that reliably goes
 * wrong: **height in px, not %.** A percentage height inside a flex row whose
 * own height is not resolved collapses to zero, and the chart renders as a thin
 * line along the baseline. Computing pixels here removes the failure mode.
 */
export function BarChart({
  bars,
  height = 160,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  bars: readonly Bar[];
  height?: number;
}) {
  const peak = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <div data-slot="bar-chart" className={cn('w-full', className)} {...props}>
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-hidden>
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="flex-1 rounded-t-[3px]"
            style={{
              height: `${Math.max(2, Math.round((bar.value / peak) * height))}px`,
              background: BAR_FILL[bar.state ?? 'past'],
            }}
          />
        ))}
      </div>

      <div className="mt-2.5 flex gap-1.5">
        {bars.map((bar) => (
          <div key={bar.key} data-num className="text-fg-subtle text-2xs flex-1 text-center">
            {bar.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- line -- */

/**
 * A single trend line with a filled area under it.
 *
 * No axes and no gridlines — the design states the delta in text at the top
 * right instead, which a reader takes in faster than they read a y-scale.
 * `preserveAspectRatio="none"` lets the 700-unit box stretch to the panel's
 * width while the vertical scale stays honest.
 */
export function LineChart({
  points,
  height = 180,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  points: readonly number[];
  height?: number;
  /** What the line shows, for a reader who cannot see it. */
  label: string;
}) {
  const WIDTH = 700;
  const TOP = 12;
  const BOTTOM = 168;

  const peak = Math.max(1, ...points);
  const x = (index: number) => (points.length > 1 ? (index / (points.length - 1)) * WIDTH : 0);
  const y = (value: number) => BOTTOM - (value / peak) * (BOTTOM - TOP);

  const plot = points.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  // `.at()` rather than an index: `noUncheckedIndexedAccess` widens a lookup to
  // `number | undefined` whatever the length check above says.
  const last = points.at(-1) ?? 0;

  return (
    <div data-slot="line-chart" className={cn('w-full', className)} style={{ height }} {...props}>
      <svg
        viewBox={`0 0 ${WIDTH} 180`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={label}
      >
        <path
          d={`M${plot.join(' L')} L${WIDTH},${BOTTOM} L0,${BOTTOM} Z`}
          fill="var(--brand-50)"
          opacity="0.4"
        />
        <polyline
          points={plot.join(' ')}
          fill="none"
          stroke="var(--brand-500)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.length > 0 ? (
          <circle
            cx={x(points.length - 1)}
            cy={y(last)}
            r="4"
            fill="var(--brand-500)"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  );
}
