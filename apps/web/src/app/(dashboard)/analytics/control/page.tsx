import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { ACTION, PageHead, Rail, Row, TableCard } from '../../screen';
import { EVENT_DOT, riskColour } from './control-data';
import { getControl } from './control-server';
import { ExportRanking } from './export-ranking';

export const generateMetadata = () => moduleMetadata('control');

/**
 * Loss prevention.
 *
 * Built to the design's Control screen: the month's four figures, then who the
 * voids and discounts belong to, then today's flagged events in order.
 *
 * The risk column is a ranking, not a verdict, and the layout says so — the
 * counts it is built from sit beside it, so a manager reads "five voids and
 * eleven per cent discount" rather than a number they cannot argue with. The
 * design puts a rail there rather than a red badge for the same reason.
 *
 * Live against `GET /api/v1/analytics/control`, which is the one endpoint in
 * this module deliberately left uncached: a manager who voids a bill and opens
 * this screen to check it has to see it, and a minute of staleness reads as
 * "the system did not record it".
 *
 * TODO — Phase 1 · analytics/control, once the module is built:
 *   - Rules and thresholds per restaurant
 *   - Drill through to the ticket behind an event
 *   - Manager approvals, and which ones were never asked for
 *   - Weekly digest to the owner
 */
const COLUMNS = '[grid-template-columns:minmax(0,1.4fr)_90px_110px_140px_90px_160px]';
const CARD = 'bg-surface rounded-lg border';

export default async function ControlPage() {
  const [nav, t, common] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.control'),
    getTranslations('console.common'),
  ]);

  // Labels resolved in one place: the fixture keys its roles and events off the
  // catalogue, and a live audit log has neither. See control-server.ts.
  const view = await getControl(t);

  /*
   * Every caption is derived where the figure above it is real.
   *
   * The four sub-lines were catalogue literals — a fixed 840 000 so'm beside a
   * live void count, "5 smenadan 3 tasida" beside a live variance — and on a
   * loss-prevention screen that is how a manager is led to accuse the wrong
   * person. A caption is dropped rather than guessed when its count is zero:
   * "0 voids worth 0 so'm" is noise, and a share with no revenue to divide by
   * is not a share.
   */
  const summary = view.summary;

  const voidsSub =
    summary.voidsTiyin === null
      ? t('kVoidsSub')
      : summary.voids === 0
        ? t('kNoneYet')
        : t('kVoidsSubLive', { amount: formatTiyinAmount(summary.voidsTiyin) });

  const deletedSub =
    summary.deletedTiyin === null
      ? t('kDeletedSub')
      : summary.deleted === 0
        ? t('kNoneYet')
        : t('kDeletedSubLive', { amount: formatTiyinAmount(summary.deletedTiyin) });

  const discountsSub =
    summary.revenueTiyin === null
      ? t('kDiscountsSub')
      : summary.revenueTiyin === 0
        ? t('kNoneYet')
        : t('kDiscountsSubLive', {
            percent: ((summary.discountsTiyin / summary.revenueTiyin) * 100).toFixed(1),
          });

  const varianceSub =
    summary.shiftsClosed === null || summary.shiftsWithVariance === null
      ? t('kVarianceSub')
      : summary.shiftsClosed === 0
        ? t('kNoneYet')
        : t('kVarianceSubLive', {
            total: summary.shiftsClosed,
            n: summary.shiftsWithVariance,
          });

  return (
    <>
      <PageHead title={nav('control')} subtitle={t('subtitle')}>
        {/*
         * The ranking on screen, as a file.
         *
         * It used to flash "eksport qilinmoqda" and produce nothing, and was
         * then a link to the printable VOIDS sheet — a real page, but a
         * different report. `POST /v1/reports/export` answers this one under
         * `kind=waiters`, which the API builds from the same
         * `LossControl::report()['staff']` query these rows came from; see
         * `export-ranking.tsx` for why that is the right name rather than a
         * substitution.
         */}
        <ExportRanking
          period="month"
          className={ACTION}
          label={t('exportExcel')}
          columns={[
            t('colStaff'),
            t('colVoids'),
            t('colDeleted'),
            t('colDiscount'),
            t('colShare'),
            t('colRisk'),
          ]}
          /* The rows exactly as the table below draws them, so a reader who
             falls back to the browser's writer gets the screen they are
             looking at rather than a second rendering of it. */
          rows={view.staff.map((person) => [
            person.name,
            String(person.voids),
            String(person.deleted),
            formatTiyinAmount(person.discount),
            person.share,
            `${person.risk}%`,
          ])}
          labels={{
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
      </PageHead>

      <div
        data-kpigrid
        className="mb-[22px] grid [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3"
      >
        {[
          {
            label: t('kVoids'),
            value: String(view.summary.voids),
            sub: voidsSub,
            tone: 'text-danger-700',
          },
          {
            label: t('kDeleted'),
            value: String(view.summary.deleted),
            sub: deletedSub,
            tone: 'text-danger-700',
          },
          {
            label: t('kDiscounts'),
            value: formatTiyinAmount(view.summary.discountsTiyin),
            sub: discountsSub,
          },
          {
            label: t('kVariance'),
            value: `−${formatTiyinAmount(view.summary.varianceTiyin)}`,
            sub: varianceSub,
            tone: 'text-warning-700',
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`${CARD} px-5 py-[18px]`}>
            <span className="text-fg-muted block text-sm">{kpi.label}</span>
            <span
              data-num
              className={`font-display mt-2 block text-3xl font-bold tracking-tight ${kpi.tone ?? ''}`}
            >
              {kpi.value}
            </span>
            <span className="text-fg-subtle mt-1.5 block text-xs">{kpi.sub}</span>
          </div>
        ))}
      </div>

      <section className={`${CARD} mb-[22px] overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-[18px] pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{t('byStaff')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{t('byStaffSub')}</p>
        </div>

        <TableCard
          columns={COLUMNS}
          className="rounded-none border-0"
          head={[
            t('colStaff'),
            { label: t('colVoids'), align: 'right' },
            { label: t('colDeleted'), align: 'right' },
            { label: t('colDiscount'), align: 'right' },
            { label: t('colShare'), align: 'right' },
            t('colRisk'),
          ]}
        >
          {view.staff.map((person) => {
            const colour = riskColour(person.risk);

            return (
              <Row key={person.id} columns={COLUMNS} className="py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs grid size-[30px] flex-none place-items-center font-semibold">
                    {person.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{person.name}</span>
                    <span className="text-fg-subtle mt-px block text-xs">{person.roleLabel}</span>
                  </span>
                </span>

                <span data-num className="text-fg-muted text-right text-sm">
                  {person.voids}
                </span>
                <span data-num className="text-fg-muted text-right text-sm">
                  {person.deleted}
                </span>
                <span data-num className="text-right text-sm font-semibold">
                  {formatTiyinAmount(person.discount)}
                </span>
                <span data-num className="text-fg-muted text-right text-sm">
                  {person.share}
                </span>

                <span className="flex items-center gap-2.5">
                  <span className="flex-1">
                    <Rail percent={person.risk} colour={colour.rail} />
                  </span>
                  <span
                    data-num
                    className={`w-[38px] flex-none text-right text-xs font-semibold ${colour.text}`}
                  >
                    {person.risk}%
                  </span>
                </span>
              </Row>
            );
          })}
        </TableCard>
      </section>

      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-[18px] pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{t('events')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{t('eventsSub')}</p>
        </div>

        {view.events.map((event) => (
          <div
            key={event.id}
            data-row
            className="border-divider flex items-center gap-3.5 border-b px-5 py-[13px]"
          >
            <span
              aria-hidden
              className={`rounded-pill size-[7px] flex-none ${EVENT_DOT[event.level]}`}
            />
            <span data-num className="text-fg-subtle w-11 flex-none text-xs">
              {event.time}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{event.what}</span>
              <span className="text-fg-subtle mt-0.5 block text-xs">
                {event.who} · {event.where}
              </span>
            </span>

            <span
              data-num
              className={`flex-none text-sm font-semibold ${
                event.level === 2 ? 'text-danger-700' : ''
              }`}
            >
              {formatTiyinAmount(event.amount)}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
