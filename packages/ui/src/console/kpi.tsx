import * as React from 'react';

import { cn } from '@restaurant/utils';

import { CARD } from './panel';

/**
 * The figure a screen opens with, and the rail underneath it.
 *
 * Built to `Smart Restaurant OS.dc.html:566-580` at its own measurements:
 * `18px 20px 16px` padding on a 14px radius, a header row holding a 10px
 * uppercase label against a tinted glyph badge, the figure at `--text-3xl`
 * display 600 on a flat leading, one 12px line carrying unit and delta, then a
 * 3px rail and the caption naming what the rail measures.
 *
 * Two things were missing and together they are why a correctly-tokenised card
 * still did not read as the design: the label was 12px sentence case where the
 * design sets 10px uppercase at `.07em`, and there was no badge at all. The
 * badge is not decoration — it is what lets an owner find *revenue* among five
 * cards without reading five labels.
 *
 * The design is specific about the rail too: it carries attainment against a
 * stated target and the caption names which target. That is the whole reason it
 * is allowed to exist — a bar at an invented width is decoration, and decoration
 * beside a number is how a reader learns to distrust the number. A KPI with no
 * target renders no rail rather than a rail at nothing.
 *
 * `data-kpi`, `data-kpiic` and `data-rail` are the design's own hooks and
 * `packages/ui/src/styles/motion.css` binds the entrance, the hover lift and the
 * rail's wipe to them. Renaming them silently removes the motion.
 */

/**
 * How a rail, a delta or a badge reads. `neutral` is a figure that is neither.
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
 * The badge's fill and glyph, as the design pairs them: the 50 step behind the
 * 600 step. Both are remapped for dark in the token layer, so the pairing holds
 * in either theme without a second table here.
 */
const BADGE: Record<Tone, { background: string; color: string }> = {
  brand: { background: 'var(--brand-50)', color: 'var(--brand-600)' },
  accent: { background: 'var(--accent-50)', color: 'var(--accent-600)' },
  success: { background: 'var(--success-50)', color: 'var(--success-600)' },
  warning: { background: 'var(--warning-50)', color: 'var(--warning-600)' },
  danger: { background: 'var(--danger-50)', color: 'var(--danger-600)' },
  neutral: { background: 'var(--bg-muted)', color: 'var(--fg-muted)' },
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
      data-rail
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

/**
 * The glyph badge in a card's top-right.
 *
 * Takes the icon rather than drawing one: which picture means "revenue" is the
 * screen's decision and the design uses a different glyph on every card. The box,
 * the radius and the hover scale are here because those are the same on all of
 * them — `[data-kpiic]` in `motion.css`.
 */
export function KpiBadge({
  tone = 'brand',
  children,
  ...props
}: React.ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span data-kpiic aria-hidden style={BADGE[tone]} {...props}>
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaTone = 'success',
  icon,
  iconTone = 'brand',
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
  /**
   * The glyph for this figure. A 15px stroked icon, as the design draws them.
   * Optional so a card in a dense grid can go without, but the design gives
   * every card in the main rows one.
   */
  icon?: React.ReactNode;
  iconTone?: Tone;
  /** 0–100, or `null` when this figure has no target and gets no rail. */
  attainment?: number | null;
  railTone?: Tone;
  /** Names the target the rail measures against. Required when there is a rail. */
  target?: React.ReactNode;
}) {
  return (
    <div data-kpi data-slot="kpi" className={cn(CARD, 'px-5 pt-[18px] pb-4', className)} {...props}>
      <div className="mb-3 flex items-start justify-between gap-2.5">
        <span className="text-fg-subtle text-3xs tracking-caps pt-[3px] leading-[1.4] font-semibold uppercase">
          {label}
        </span>
        {icon ? <KpiBadge tone={iconTone}>{icon}</KpiBadge> : null}
      </div>

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
