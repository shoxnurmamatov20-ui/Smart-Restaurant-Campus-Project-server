'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { shiftMonth } from './month-nav';

/**
 * Which month the statement is about.
 *
 * The design draws a period control on this screen. It was removed rather than
 * left flashing "the period picker is on its way", because `financeScreen()`
 * took the month as an argument and nothing on the page could pass one — the
 * screen could only ever show the month that had just finished.
 *
 * The choice goes in the URL, like the dashboard's period segment and for the
 * same three reasons: it survives a reload, it can be sent to somebody ("look
 * at July"), and the server renders the whole page against it — so the P&L, the
 * payment mix and the four cards under them cannot disagree about which month
 * they are describing.
 *
 * ---------------------------------------------------------------------------
 * The label is rendered on the server
 *
 * `Intl.DateTimeFormat` writes the month's name and it is deliberately NOT
 * called here: a client component formatting a date produces the server's
 * string and the browser's string, and where the two ICU builds differ React
 * throws a hydration error over a working page. The page formats it once and
 * hands it down.
 *
 * ---------------------------------------------------------------------------
 * Forwards stops at the current month
 *
 * A statement about a month that has not started is an empty sheet with a
 * confident heading. The arrow is disabled rather than hidden, so the reader
 * can see where the end of the road is.
 */
export function MonthPicker({
  month,
  label,
  latest,
  prevLabel,
  nextLabel,
}: {
  /** `YYYY-MM`, the month being drawn. */
  month: string;
  /** That month's name, already formatted in the reader's language. */
  label: string;
  /** The newest month that may be asked for, `YYYY-MM`. */
  latest: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (by: number) => {
    const next = shiftMonth(month, by);

    if (next > latest) return;

    const query = new URLSearchParams(params.toString());

    query.set('month', next);
    router.push(`${pathname}?${query.toString()}`);
  };

  const atLatest = month >= latest;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={prevLabel}
        onClick={() => go(-1)}
        className="border-border-strong bg-surface text-fg-muted hover:bg-bg-muted grid size-8 flex-none place-items-center rounded-md border text-sm font-semibold"
      >
        ‹
      </button>

      <span className="text-fg min-w-[132px] text-center text-sm font-medium">{label}</span>

      <button
        type="button"
        aria-label={nextLabel}
        disabled={atLatest}
        onClick={() => go(1)}
        className="border-border-strong bg-surface text-fg-muted hover:bg-bg-muted grid size-8 flex-none place-items-center rounded-md border text-sm font-semibold disabled:opacity-35"
      >
        ›
      </button>
    </div>
  );
}
