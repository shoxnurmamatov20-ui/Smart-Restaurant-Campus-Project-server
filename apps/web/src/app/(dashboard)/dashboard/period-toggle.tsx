'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PERIODS, type Period } from './overview-data';

/**
 * Today · Week · Month, and it actually switches.
 *
 * The console had this control on seven dashboards and on none of them did it
 * do anything: the first option was hardcoded active and there was no handler.
 * A segmented control that does not move is not a placeholder — it reads as a
 * broken product, and a reader who tries it twice stops trusting the other
 * controls on the page.
 *
 * The choice goes in the URL rather than in state. It survives a reload, it can
 * be sent to somebody ("look at the month"), and the server renders the answer
 * — so the whole page is consistent rather than a KPI row that changed while
 * the chart under it did not.
 */
export function PeriodToggle({
  current,
  labels,
  ariaLabel,
}: {
  current: Period;
  labels: Readonly<Record<Period, string>>;
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (period: Period) => {
    const next = new URLSearchParams(params.toString());

    /* `today` is the default, so it comes out of the URL rather than sitting
       in it — a shared link should be the short one. */
    if (period === 'today') next.delete('period');
    else next.set('period', period);

    const query = next.toString();

    router.push(query === '' ? pathname : `${pathname}?${query}`);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="bg-bg-muted flex flex-none items-center gap-0.5 rounded-md p-[3px]"
    >
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          role="tab"
          aria-selected={current === period}
          data-seg
          data-active={current === period ? 'true' : undefined}
          onClick={() => go(period)}
          className="text-fg-muted h-[30px] rounded-[7px] px-3.5 text-sm font-medium"
        >
          {labels[period]}
        </button>
      ))}
    </div>
  );
}
