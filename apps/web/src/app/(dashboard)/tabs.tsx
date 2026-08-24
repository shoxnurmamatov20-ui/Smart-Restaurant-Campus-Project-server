'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { flash } from '@restaurant/ui';

import { ACTION, ACTION_PRIMARY } from './screen';

/**
 * The module tab strip, as the design draws it.
 *
 * Not an underline. `Smart Restaurant OS.dc.html:1767` (menu), `:2111`
 * (inventory), `:2467` (staff) all draw the same control: a `--bg-muted` track
 * with 3px of padding and an 11px radius, holding 32px pills at an 8px radius,
 * the active one lifted onto `--surface` with `--shadow-xs`. The console
 * shipped an underlined strip instead, which is a different control from a
 * different design system — and once five screens use it, it is the console's
 * own look rather than the design's.
 *
 * The pills carry a label and nothing else. The counts this strip used to print
 * beside each label are not in the file; where the design wants a count it puts
 * it in a KPI, where it has room to say what the count is *of*.
 *
 * Panels are passed as children keyed by tab, so a page keeps rendering its
 * heavy tables on the server and only the switch is hydrated. Inactive panels
 * are rendered and hidden rather than unmounted — a table of two hundred dishes
 * should not be rebuilt because somebody looked at Categories and came back.
 */

/**
 * A button in the page head that belongs to this strip.
 *
 * Data only, never a callback: every page that draws one of these is a server
 * component, and a server component cannot hand a client one a function. `tab`
 * switches the strip, `message` is what the toast says. A button with neither
 * is the thing this prop exists to stop.
 */
export type TabAction = {
  label: string;
  /** Which tab to open. */
  tab?: string;
  /**
   * Where it goes, when the design's handler navigates rather than switches.
   *
   * `iv.goCount` and `iv.goWaste` both leave the store screen for stock
   * operations; a toast in their place would be a button that says something
   * happened somewhere else and then does not take you there.
   */
  href?: string;
  /** What to say once it happened. The whole job when there is no `tab`. */
  message?: string;
  /** The design gives a screen at most one filled button. */
  primary?: boolean;
};

export function Tabs({
  tabs,
  panels,
  ariaLabel,
  title,
  subtitle,
  actions,
}: {
  tabs: readonly { key: string; label: string }[];
  panels: Readonly<Record<string, ReactNode>>;
  ariaLabel: string;
  /**
   * The page's heading, when the head's buttons need to reach the strip.
   *
   * Optional: a screen whose actions do not switch tabs keeps its own
   * `<PageHead>` and passes neither.
   */
  title?: string;
  subtitle?: string;
  actions?: readonly TabAction[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? '');

  function run(action: TabAction) {
    if (action.tab !== undefined) setActive(action.tab);
    if (action.message !== undefined) flash(action.message);
  }

  return (
    <>
      {title === undefined ? null : (
        <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
            {subtitle ? <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p> : null}
          </div>

          {actions === undefined ? null : (
            <div data-pageactions className="flex flex-none gap-2.5">
              {actions.map((action) =>
                action.href === undefined ? (
                  <button
                    key={action.label}
                    type="button"
                    data-press
                    onClick={() => run(action)}
                    className={action.primary ? ACTION_PRIMARY : ACTION}
                  >
                    {action.label}
                  </button>
                ) : (
                  <Link
                    key={action.label}
                    href={action.href}
                    data-press
                    className={`grid place-items-center ${action.primary ? ACTION_PRIMARY : ACTION}`}
                  >
                    {action.label}
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      )}

      <div
        role="tablist"
        aria-label={ariaLabel}
        className="bg-bg-muted mb-[18px] flex w-fit max-w-full gap-[3px] overflow-x-auto rounded-[11px] p-[3px]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-seg
            data-active={active === tab.key ? 'true' : undefined}
            aria-selected={active === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            className="text-fg-muted h-8 rounded-lg border-0 bg-transparent px-[15px] text-sm font-semibold whitespace-nowrap"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`panel-${tab.key}`}
          role="tabpanel"
          hidden={active !== tab.key}
          aria-labelledby={tab.key}
          data-panel-in={active === tab.key ? '' : undefined}
        >
          {panels[tab.key]}
        </div>
      ))}
    </>
  );
}
