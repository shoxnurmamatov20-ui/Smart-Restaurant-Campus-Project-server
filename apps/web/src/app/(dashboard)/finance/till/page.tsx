import { getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  DataHead,
  DataTable,
  DataTd,
  DataTh,
  DataTr,
  KpiCard,
  KpiRow,
  PageHead,
  Panel,
  PanelHead,
  StatusChip,
} from '@restaurant/ui';

import { getTill } from './till-data';

export async function generateMetadata() {
  const t = await getTranslations('console.nav');
  return { title: t('till') };
}

/**
 * The till.
 *
 * The design's §3.6: the drawer's state across the top, every movement through
 * it underneath, and the three things a cashier does to it — drop to the safe,
 * read an X report, count and close with a Z.
 *
 * The expected figure is derived from the movements rather than stored, which
 * is `till-data.ts`'s doing and is the point: the number a cashier is counted
 * against has to be one the ledger can reproduce line by line, or a variance is
 * an argument rather than a finding.
 *
 * The three actions carry their endpoints as TODOs rather than doing anything.
 * A till that closes only in the browser is a till that reopens on refresh, and
 * the design's Z flow — count, see the variance, *then* confirm — has to be
 * server-backed to mean anything.
 */
export default async function TillPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.till'),
  ]);

  // The API when there is a session, the fixtures when there is not.
  const till = await getTill(t);
  const expected = till.expected;

  return (
    <>
      <PageHead title={nav('till')} lede={t('subtitle')} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusChip tone="success" dot>
          {t('stateOpen')}
        </StatusChip>
        <span className="text-fg-subtle text-xs">{t('openedAt')}</span>

        <span className="ml-auto flex items-center gap-2.5">
          <StatusChip tone="success" dot>
            {t('fiscal')}
          </StatusChip>
          <span className="text-fg-subtle text-xs">{t('fiscalOk')}</span>
        </span>
      </div>

      <KpiRow>
        <KpiCard
          label={t('kDrawer')}
          value={formatTiyinAmount(expected)}
          unit={t('kDrawerSub')}
          attainment={null}
        />
        <KpiCard
          label={t('kSales')}
          value={formatTiyinAmount(till.sales)}
          unit={t('kSalesSub')}
          attainment={null}
        />
        <KpiCard
          label={t('kChecks')}
          value={formatNumber(till.receipts)}
          unit={t('kChecksSub')}
          attainment={null}
        />
        <KpiCard
          label={t('kRefunds')}
          value={formatTiyinAmount(till.refunds)}
          unit={t('kRefundsSub')}
          attainment={null}
        />
        <KpiCard
          label={t('kDrops')}
          value={formatTiyinAmount(till.dropped)}
          unit={t('kDropsSub')}
          attainment={null}
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <Panel>
          <PanelHead title={t('movement')} />

          <DataTable minWidth={520}>
            <DataHead>
              <tr>
                <DataTh>{t('colTime')}</DataTh>
                <DataTh>{t('colType')}</DataTh>
                <DataTh align="right">{t('colAmount')}</DataTh>
              </tr>
            </DataHead>
            <tbody>
              {till.moves.map((move) => (
                <DataTr key={`${move.time}-${move.label}`}>
                  <DataTd numeric className="text-fg-muted">
                    {move.time}
                  </DataTd>
                  <DataTd className="font-medium">{move.label}</DataTd>
                  <DataTd
                    align="right"
                    numeric
                    className={move.into ? 'font-semibold' : 'text-danger-700 font-semibold'}
                  >
                    {move.into ? '' : '−'}
                    {formatTiyinAmount(move.amount)}
                  </DataTd>
                </DataTr>
              ))}
            </tbody>
          </DataTable>

          <div className="border-divider mt-4 flex items-baseline justify-between gap-3 border-t pt-4">
            <span className="text-md font-semibold">{t('expected')}</span>
            <span data-num className="font-display tracking-snug text-xl font-bold">
              {formatTiyinAmount(expected)}
            </span>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead title={t('drop')} subtitle={t('dropSub')} />
            {/* TODO(api): POST /api/v1/finance/till/drop { amount } — a drop is
                a movement, so it lands in the log and the expected figure falls
                with it. Every one is audited: a drawer is where a restaurant
                loses money quietly. */}
            <button
              type="button"
              className="bg-bg-muted text-fg h-11 w-full rounded-md text-sm font-semibold"
            >
              {t('drop')}
            </button>
          </Panel>

          <Panel>
            <PanelHead title={t('xReport')} subtitle={t('xSub')} />
            {/* TODO(api): GET /api/v1/finance/till/x-report — a read, never a
                write. An X report that closes anything is a bug that costs a
                shift. */}
            <button
              type="button"
              className="bg-bg-muted text-fg h-11 w-full rounded-md text-sm font-semibold"
            >
              {t('xReport')}
            </button>
          </Panel>

          <Panel>
            <PanelHead title={t('zReport')} subtitle={t('zSub')} />

            <dl className="mb-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t('expected')}</dt>
                <dd data-num className="font-semibold">
                  {formatTiyinAmount(expected)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t('counted')}</dt>
                <dd data-num className="text-fg-subtle">
                  —
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t('variance')}</dt>
                <dd data-num className="text-fg-subtle">
                  —
                </dd>
              </div>
            </dl>

            {/* TODO(api): POST /api/v1/finance/till/close { counted_cash }. The
                design's flow is count → see expected, counted and variance →
                confirm, in that order: a cashier who has miscounted should get
                to count again, not an explanation of a discrepancy they can no
                longer undo. */}
            <button
              type="button"
              className="bg-danger-500 h-11 w-full rounded-md text-sm font-semibold text-white"
            >
              {t('zReport')}
            </button>
          </Panel>
        </div>
      </div>
    </>
  );
}
