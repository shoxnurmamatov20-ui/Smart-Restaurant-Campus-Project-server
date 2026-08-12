import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * The surfaces every console screen is built out of.
 *
 * Borders first, shadows second — the design's rule, and the reason a panel is
 * a hairline on `--surface` rather than a floating card. Shadows are reserved
 * for things that genuinely float: dropdowns, modals, toasts.
 *
 * The measurements are the prototype's, not approximations of it: 14px radius,
 * 1px border, and the 24px/22px/18px padding the owner's overview already uses.
 * Screens that reach for these instead of re-typing the numbers are screens
 * that cannot drift apart.
 */

/** A raised surface: hairline first, shadow only for things that float. */
export const CARD = 'bg-surface rounded-lg border';

/** A panel heading — 15px display, the design's card title. */
export const PANEL_TITLE = 'font-display text-md font-semibold tracking-snug';

export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="panel"
      className={cn(CARD, 'px-6 pt-[22px] pb-[18px]', className)}
      {...props}
    />
  );
}

/**
 * A panel's title row: heading and optional subtitle on the left, whatever the
 * panel needs on the right — a legend, a filter, a link out.
 */
export function PanelHead({
  title,
  subtitle,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="panel-head"
      className={cn('mb-[22px] flex items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="min-w-0">
        <h3 className={PANEL_TITLE}>{title}</h3>
        {subtitle ? <p className="text-fg-subtle mt-1 text-xs">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-none items-center gap-4">{action}</div> : null}
    </div>
  );
}

/**
 * The head of a screen: an overline date, the greeting, a one-sentence lede,
 * and the period toggle opposite.
 *
 * Every dashboard in the design opens with this exact block, which is why it is
 * one component rather than seven copies that slowly disagree about whether the
 * eyebrow is 11px or 12px.
 *
 * `data-pagehead` is the hook app-shell.css uses to stack it under 820px.
 */
export function PageHead({
  eyebrow,
  title,
  lede,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-pagehead
      data-slot="page-head"
      className={cn('mb-6 flex items-end justify-between gap-6', className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-fg-subtle tracking-caps mb-2 text-xs font-semibold uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="font-display text-3xl leading-[1.1] font-semibold tracking-tight">
          {title}
        </h2>
        {lede ? <p className="text-fg-muted text-md mt-2 leading-normal">{lede}</p> : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}

/**
 * A legend entry: an 8px dot and a name.
 *
 * `colour` is a class (`bg-brand-500`) rather than a value, so a legend and the
 * mark it describes are painted from the same token and cannot drift.
 */
export function Legend({
  colour,
  children,
  className,
  ...props
}: React.ComponentProps<'span'> & { colour: string }) {
  return (
    <span
      data-slot="legend"
      className={cn('text-fg-subtle flex items-center gap-[7px] text-xs', className)}
      {...props}
    >
      <span aria-hidden className={cn('rounded-pill size-2 flex-none', colour)} />
      {children}
    </span>
  );
}
