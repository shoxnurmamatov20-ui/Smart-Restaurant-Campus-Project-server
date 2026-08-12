import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { PageHead, Rail, Row, TableCard } from '../../screen';
import {
  CONTROL_EVENTS,
  CONTROL_STAFF,
  CONTROL_SUMMARY,
  EVENT_DOT,
  riskColour,
} from './control-data';

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
 * TODO — Phase 1 · analytics/control, once the module is built:
 *   - Rules and thresholds per restaurant
 *   - Drill through to the ticket behind an event
 *   - Manager approvals, and which ones were never asked for
 *   - Weekly digest to the owner
 */
const COLUMNS = '[grid-template-columns:minmax(0,1.4fr)_90px_110px_140px_90px_160px]';
const CARD = 'bg-surface rounded-lg border';

export default async function ControlPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.control'),
  ]);

  return (
    <>
      <PageHead title={nav('control')} subtitle={t('subtitle')}>
        <button
          type="button"
          className="border-border-strong bg-surface text-fg hover:bg-bg-muted h-9 rounded-md border px-3.5 text-sm font-semibold whitespace-nowrap"
        >
          {t('exportExcel')}
        </button>
      </PageHead>

      <div
        data-kpigrid
        className="mb-[22px] grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3"
      >
        {[
          {
            label: t('kVoids'),
            value: String(CONTROL_SUMMARY.voids),
            sub: t('kVoidsSub'),
            tone: 'text-danger-700',
          },
          {
            label: t('kDeleted'),
            value: String(CONTROL_SUMMARY.deleted),
            sub: t('kDeletedSub'),
            tone: 'text-danger-700',
          },
          {
            label: t('kDiscounts'),
            value: formatTiyinAmount(CONTROL_SUMMARY.discountsTiyin),
            sub: t('kDiscountsSub'),
          },
          {
            label: t('kVariance'),
            value: `−${formatTiyinAmount(CONTROL_SUMMARY.varianceTiyin)}`,
            sub: t('kVarianceSub'),
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
          {CONTROL_STAFF.map((person) => {
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
                    <span className="text-fg-subtle mt-px block text-xs">{t(person.role)}</span>
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

        {CONTROL_EVENTS.map((event) => (
          <div
            key={`${event.time}-${event.what}`}
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
              <span className="block text-sm font-medium">{t(event.what)}</span>
              <span className="text-fg-subtle mt-0.5 block text-xs">
                {event.who === 'evShiftWho' ? t('evShiftWho') : event.who} · {t(event.where)}
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
