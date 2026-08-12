import { getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../../module-page';
import { ACTION, PageHead } from '../../screen';

export const generateMetadata = () => moduleMetadata('reports');

/**
 * The standard reports.
 *
 * Built to the design's Reports screen: a card per report on an auto-fill grid
 * at 340px, each one saying what it contains, when it runs and what it comes
 * out as, with the two actions the design gives it.
 *
 * The schedule and format are pills rather than prose because the question a
 * manager arrives with is "which of these already goes out on its own" — that
 * is a scan, not a read.
 *
 * TODO — Phase 1 · analytics/reports, once the module is built:
 *   - Running one, and where the file lands
 *   - Editing the schedule and its recipients
 *   - The custom report builder behind the button above
 *   - Retention: how long a generated file is kept
 */
const REPORTS = [
  { key: 'z', schedule: 'schDaily', formats: 'PDF, XLSX' },
  { key: 'items', schedule: 'schWeekly', formats: 'XLSX' },
  { key: 'stock', schedule: 'schWeekly', formats: 'XLSX' },
  { key: 'labour', schedule: 'schBiweekly', formats: 'PDF' },
  { key: 'vat', schedule: 'schMonthly', formats: 'PDF, XML' },
  { key: 'branch', schedule: 'schMonthly', formats: 'PDF' },
] as const;

export default async function ReportsPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.reports'),
  ]);

  return (
    <>
      <PageHead title={nav('reports')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION}>
          {t('custom')}
        </button>
      </PageHead>

      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] gap-4">
        {REPORTS.map((report) => (
          <div
            key={report.key}
            className="bg-surface flex flex-col gap-3 rounded-lg border px-6 py-[22px]"
          >
            <h3 className="text-md tracking-snug font-semibold">{t(`${report.key}Title`)}</h3>
            <p className="text-fg-muted text-sm leading-normal text-pretty">
              {t(`${report.key}Body`)}
            </p>

            <div className="mt-0.5 flex gap-2">
              <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs px-[9px] py-1 font-medium">
                {t(report.schedule)}
              </span>
              <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs px-[9px] py-1 font-medium">
                {report.formats}
              </span>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-semibold"
              >
                {t('runNow')}
              </button>
              <button
                type="button"
                className="text-fg-muted hover:bg-bg-subtle h-9 rounded-md px-3.5 text-sm font-medium"
              >
                {t('schedule')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
