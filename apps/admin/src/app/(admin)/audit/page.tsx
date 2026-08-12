import { getTranslations } from 'next-intl/server';

import { ACCESS_LOG } from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('audit') };
}

/**
 * Who did what in this console.
 *
 * Built to the design's access log: three columns, one dot, no filters. The
 * dot's colour is the only signal — amber for an impersonation, red for a
 * suspension, green for money moving.
 *
 * The note above the table is not decoration. Someone reading this screen is
 * either checking their own trail or somebody else's, and both need to know the
 * record cannot be edited.
 *
 * TODO — once the platform API lands:
 *   - The full log with date range, actor and action filters
 *   - Export, for the times a regulator asks
 *   - Retention, stated in the interface rather than in a runbook
 */
const COLUMNS = '[grid-template-columns:minmax(0,1fr)_minmax(0,2fr)_160px] gap-4 px-[22px]';

export default async function AccessLogPage() {
  const t = await getTranslations('platform.audit');
  const col = await getTranslations('platform.columns');

  return (
    <>
      <p className="text-fg-muted mb-[18px] text-sm">{t('note')}</p>

      <div className="bg-surface overflow-hidden rounded-lg border" data-table="s">
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} border-b py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{col('who')}</span>
          <span>{col('action')}</span>
          <span>{col('when')}</span>
        </div>

        {ACCESS_LOG.map((entry) => (
          <div
            key={`${entry.when}-${entry.who}`}
            data-row
            className={`border-divider grid ${COLUMNS} items-center border-b py-3.5 last:border-b-0`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden className={`rounded-pill size-[7px] flex-none ${entry.dot}`} />
              <span className="truncate text-sm font-semibold">{entry.who}</span>
            </span>
            <span className="text-fg-muted text-sm">{entry.action}</span>
            <span data-num className="text-fg-subtle text-sm">
              {entry.when}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
