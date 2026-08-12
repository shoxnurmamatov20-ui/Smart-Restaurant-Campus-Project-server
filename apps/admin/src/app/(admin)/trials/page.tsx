import Link from 'next/link';

import { getTranslations } from 'next-intl/server';

import { formatNumber } from '@restaurant/utils';

import { TENANTS, TRIAL_SUMMARY } from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('trials') };
}

/**
 * The restaurants still deciding.
 *
 * Built to the design's trials view: how many are in trial, how many end this
 * week, and last month's conversion — then the accounts themselves with the
 * days each has left.
 *
 * Five days is the line. Under it the figure turns red, because a trial that
 * ends on Friday is a conversation somebody has to have on Monday, not a row to
 * notice later.
 *
 * TODO — once the platform API lands:
 *   - Real trial clocks off the signup date rather than a stored number
 *   - Extending a trial, with a reason recorded
 *   - Conversion by cohort, which one figure hides
 */
export default async function TrialsPage() {
  const t = await getTranslations('platform.trials');
  const empty = await getTranslations('platform.empty');

  const trials = TENANTS.filter((tenant) => tenant.state === 2);

  /* A trial runs fourteen days; the design's cohort sits at these marks. */
  const CLOCK = [3, 9, 12, 14];
  const daysLeft = (index: number) => CLOCK[index % CLOCK.length]!;

  return (
    <>
      <div className="bg-surface mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] overflow-hidden rounded-lg border">
        {[
          { label: t('open'), value: formatNumber(trials.length) },
          {
            label: t('ending'),
            value: formatNumber(TRIAL_SUMMARY.endingThisWeek),
            tone: 'text-warning-700',
          },
          { label: t('conversion'), value: TRIAL_SUMMARY.converted },
        ].map((cell) => (
          <div key={cell.label} className="border-divider border-r px-[22px] py-5 last:border-r-0">
            <div className="text-fg-subtle mb-2.5 text-xs">{cell.label}</div>
            <div
              data-num
              className={`font-display text-3xl leading-none font-semibold tracking-tight ${cell.tone ?? ''}`}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      {trials.length === 0 ? (
        <div className="bg-surface text-fg-subtle rounded-lg border px-8 py-14 text-center text-sm">
          {empty('title')}
        </div>
      ) : (
        <div className="bg-surface overflow-hidden rounded-lg border" data-table="s">
          {trials.map((tenant, index) => {
            const left = daysLeft(index);

            return (
              <Link
                key={tenant.id}
                href={`/tenants/${tenant.id}`}
                data-row
                className="border-divider flex items-center gap-4 border-b px-[22px] py-4 text-left last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{tenant.name}</span>
                  <span className="text-fg-subtle mt-0.5 block text-xs">
                    {tenant.city} · {tenant.owner} · <span data-num>{tenant.since}</span>
                  </span>
                </span>

                <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs px-[9px] py-1 font-semibold">
                  {tenant.plan}
                </span>

                <span
                  data-num
                  className={`text-sm font-semibold whitespace-nowrap ${
                    left <= 5 ? 'text-danger-700' : ''
                  }`}
                >
                  {left} {t('daysLeft')}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
