import { getLocale, getTranslations } from 'next-intl/server';

import { apiGet } from '@/lib/api-server';

import { moduleMetadata } from '../../module-page';
import { ReportsScreen } from './reports-panels';
import { REPORT_CARDS, type Lang } from './reports-data';

export const generateMetadata = () => moduleMetadata('reports');

/**
 * The standard reports — `Smart Restaurant OS.dc.html:3367-3449`.
 *
 * Eleven cards, of which five open a report a manager can actually read. The
 * console shipped six: the ones with nothing behind them. Five of those six
 * cards are exports that arrive by schedule, and saying so is honest; a screen
 * where every card only says "it will be emailed to you" is a directory, not a
 * reporting module.
 *
 * The viewer, the custom-report builder and the schedule sheet all live in
 * `reports-panels.tsx` because each one is a local state this page cannot
 * settle on the server.
 *
 * TODO — Phase 1 · analytics/reports, once the module is built:
 *   - Running one for real, and where the generated file lands
 *   - Editing an existing schedule and its recipients
 *   - Retention: how long a generated file is kept
 */
export default async function ReportsPage() {
  const [nav, t, common, locale, schedules] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.reports'),
    getTranslations('console.common'),
    getLocale(),
    /*
     * How many deliveries are actually set up.
     *
     * The catalogue's subtitle claims "scheduled deliveries go to 4
     * recipients" — the design's own four, on a restaurant that has scheduled
     * none. The card count is structural and stays; the recipient clause has
     * to come from the register. `null` means no session or no answer, and
     * then the catalogue sentence is right because everything else on the
     * screen is the design's too.
     */
    apiGet<{ data?: unknown[] }>('/analytics/schedules'),
  ]);

  const scheduled = schedules?.data?.length ?? null;

  return (
    <ReportsScreen
      lang={locale as Lang}
      title={nav('reports')}
      subtitle={
        scheduled === null
          ? t('subtitle')
          : t('subtitleLive', { reports: REPORT_CARDS.length, schedules: scheduled })
      }
      /*
       * The export sheet's own wording, from `common` — the same source the
       * orders table reads. A second copy under `console.reports` would be a
       * second thing to keep translated, and the first divergence would be a
       * Russian button that still said CSV.
       */
      exportLabels={{
        title: common('exportTitle'),
        body: common('exportBody'),
        rowCount: common.raw('exportRows') as string,
        format: common('exportFormat'),
        csv: common('exportCsv'),
        excel: common('exportExcelFormat'),
        download: common('exportDownload'),
        cancel: common('cancel'),
        note: common('exportNote'),
      }}
    />
  );
}
