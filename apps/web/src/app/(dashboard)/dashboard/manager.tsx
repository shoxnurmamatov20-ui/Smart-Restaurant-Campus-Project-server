import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  CellBar,
  DataHead,
  DataTable,
  DataTd,
  DataTh,
  DataTr,
  Donut,
  EmptyState,
  KpiCard,
  KpiRow,
  PageHead,
  Panel,
  PanelHead,
} from '@restaurant/ui';

import { todayLabel } from '@/lib/today-label';

import { type Period } from './overview-data';
import { PeriodToggle } from './period-toggle';
import { GLYPH } from './kpi-icons';

import { ApprovalQueue } from './approval-queue';
import { delta, peakOf, rail, show } from './figures';
import { type ApprovalAction, type StationRow } from './manager-data';
import { getManagerLive } from './dashboard-server';

/**
 * What a till asked for, in the catalogue's own words.
 *
 * Ten keys of this screen's own rather than `console.permissions`: the matrix
 * words two discount ceilings and the till asks for one `discount`, so mapping
 * across put a ceiling on screen that nobody had asked for.
 */
export const APPROVAL_LABEL: Record<ApprovalAction, string> = {
  voidLine: 'apVoidLine',
  voidOrder: 'apVoidOrder',
  discount: 'apDiscount',
  priceOverride: 'apPriceOverride',
  reopenBill: 'apReopenBill',
  refund: 'apRefund',
  drawerOpen: 'apDrawerOpen',
  comp: 'apComp',
  shiftVariance: 'apShiftVariance',
  creditSale: 'apCreditSale',
};

/**
 * The branch manager's shift dashboard.
 *
 * The design's §3.2 row for this role, panel for panel: four figures about
 * right now, then the leaderboard and station speeds on the left against the
 * floor, the rota and the approval queue on the right.
 *
 * A manager reads this standing up, between two tables. Everything that needs a
 * decision — the approval queue, a station over its target — is on the screen
 * without scrolling; the leaderboard, which is interesting rather than urgent,
 * is what falls below the fold.
 */
export async function ManagerDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, shared, station, roleName, pin] = await Promise.all([
    getManagerLive(period),
    getTranslations('console.dashManager'),
    getTranslations('console.dashboard'),
    getTranslations('console.kitchen'),
    getTranslations('console.roles'),
    getTranslations('console.approvalPin'),
  ]);

  const STATION_LABEL: Record<StationRow['id'], string> = {
    grill: station('stationGrill'),
    hot: station('stationHot'),
    cold: station('stationCold'),
    bar: station('stationBar'),
  };

  // Seeded with zero rather than spread over an empty array: `-Infinity` was
  // the reason this leaderboard used to fall back to five invented waiters.
  const busiest = peakOf(data.waiters.map((waiter) => waiter.revenue));
  const room = data.floor;

  return (
    <>
      <PageHead
        eyebrow={todayLabel(await getLocale(), new Date())}
        title={t('greeting', { name: data.greetingName })}
        lede={
          data.live
            ? t('ledeLive', { place: data.placeName, count: data.approvals.length })
            : t('lede')
        }
        action={
          <PeriodToggle
            current={period}
            ariaLabel={shared('kpiLabel')}
            labels={{
              today: shared('periodToday'),
              week: shared('periodWeek'),
              month: shared('periodMonth'),
            }}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        {/*
          The rails are the fixture's own. Every target on this row — 18 open
          tickets, 12 minutes, 2 cancellations, 260 covers — is a number out of
          the design, and scoring a live venue against another restaurant's
          shift plan is worse than showing it no bar at all. `rail()` returns
          null on a live tenant, which `KpiCard` draws as no rail and no caption.
        */}
        <KpiCard
          label={t('kOpen')}
          {...GLYPH.open}
          value={show(data.openOrders, formatNumber)}
          unit={t('tickets')}
          attainment={rail(data.live, data.openOrders, 18)}
          target={t('targetOpen')}
          railTone="brand"
        />
        <KpiCard
          label={t('kWait')}
          {...GLYPH.wait}
          value={show(data.averageWaitMinutes, formatNumber)}
          unit={t('minutes')}
          delta={delta(data.live, (data.averageWaitMinutes ?? 0) <= 12 ? '−3' : '+2')}
          deltaTone={(data.averageWaitMinutes ?? 0) <= 12 ? 'success' : 'danger'}
          attainment={rail(data.live, data.averageWaitMinutes, 12)}
          target={t('targetWait')}
          railTone={(data.averageWaitMinutes ?? 0) <= 12 ? 'success' : 'danger'}
        />
        <KpiCard
          label={t('kCancelled')}
          {...GLYPH.cancelled}
          value={show(data.cancelled, formatNumber)}
          unit={t('tickets')}
          attainment={rail(data.live, data.cancelled, 2)}
          target={t('targetCancel')}
          railTone={(data.cancelled ?? 0) <= 2 ? 'success' : 'danger'}
        />
        <KpiCard
          label={t('kCovers')}
          {...GLYPH.guests}
          value={show(data.covers, formatNumber)}
          unit={t('guests')}
          attainment={rail(data.live, data.covers, 260)}
          target={t('targetCovers')}
          railTone="accent"
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        {/* ---- primary ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead title={t('waiters')} subtitle={t('waitersSub')} />

            {data.waiters.length === 0 ? (
              <EmptyState className="py-4">{t('waitersEmpty')}</EmptyState>
            ) : (
              <>
                <DataTable minWidth={560}>
                  <DataHead>
                    <tr>
                      <DataTh>{t('colWaiter')}</DataTh>
                      <DataTh align="right">{t('colTickets')}</DataTh>
                      <DataTh align="right">{t('colCovers')}</DataTh>
                      <DataTh align="right">{t('colRevenue')}</DataTh>
                      <DataTh align="right">{t('colAvg')}</DataTh>
                    </tr>
                  </DataHead>
                  <tbody>
                    {data.waiters.map((waiter) => (
                      <DataTr key={waiter.id}>
                        <DataTd>
                          <span className="flex items-center gap-2.5">
                            <span
                              aria-hidden
                              className="bg-bg-muted text-fg-muted rounded-pill text-2xs grid size-7 flex-none place-items-center font-semibold"
                            >
                              {waiter.initials}
                            </span>
                            <span className="truncate font-medium">{waiter.name}</span>
                          </span>
                        </DataTd>
                        <DataTd align="right" numeric>
                          {formatNumber(waiter.tickets)}
                        </DataTd>
                        <DataTd align="right" numeric>
                          {formatNumber(waiter.covers)}
                        </DataTd>
                        <DataTd align="right" numeric className="font-semibold">
                          {formatTiyinAmount(waiter.revenue)}
                        </DataTd>
                        <DataTd align="right" numeric className="text-fg-muted">
                          {formatTiyinAmount(waiter.average)}
                        </DataTd>
                      </DataTr>
                    ))}
                  </tbody>
                </DataTable>

                {/* The bar under the table is the same comparison the numbers make,
                  seen at a glance. It is deliberately not a second chart panel. */}
                <div className="mt-4 flex flex-col gap-2.5">
                  {data.waiters.map((waiter) => (
                    <div key={waiter.id} className="flex items-center gap-3">
                      <span className="text-fg-subtle w-[86px] flex-none truncate text-xs">
                        {waiter.name.split(' ')[0]}
                      </span>
                      <CellBar
                        percent={(waiter.revenue / busiest) * 100}
                        fill="var(--brand-500)"
                        label={waiter.name}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel>
            <PanelHead title={t('stations')} subtitle={t('stationsSub')} />

            {data.stations.length === 0 ? (
              <EmptyState className="py-4">{t('stationsEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-3.5">
                {data.stations.map((row) => {
                  const over = row.minutes > row.target;

                  return (
                    <div key={row.id} className="flex items-center gap-3.5">
                      <span className="w-[92px] flex-none truncate text-sm font-medium">
                        {STATION_LABEL[row.id]}
                      </span>
                      <CellBar
                        percent={(row.minutes / 20) * 100}
                        fill={over ? 'var(--warning-500)' : 'var(--brand-500)'}
                        label={STATION_LABEL[row.id]}
                      />
                      <span
                        data-num
                        className={`w-[70px] flex-none text-right text-sm font-semibold ${
                          over ? 'text-warning-700' : ''
                        }`}
                      >
                        {row.minutes} {t('minutes')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* ---- side ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead
              title={t('floorTitle')}
              action={
                <Link href="/tables" className="text-fg-brand text-xs font-semibold">
                  {t('openFloor')}
                </Link>
              }
            />

            {/*
              Two slices where the server counts two. `FloorTally` publishes
              `occupied` and `free` and says why a table being cleaned is
              neither; the design's third and fourth slices are drawn only where
              a fixture has them, because zeroing them tells a manager no table
              is booked tonight, and borrowing the fixture's four and three
              prints a legend that does not add up to the total beside it.
            */}
            {room === null || room.total === 0 ? (
              <EmptyState className="py-4">{t('floorEmpty')}</EmptyState>
            ) : (
              <Donut
                total={formatNumber(room.total)}
                totalLabel={t('floorTotal')}
                slices={[
                  {
                    key: 'busy',
                    label: t('floorBusy'),
                    value: room.busy,
                    colour: 'var(--brand-500)',
                  },
                  {
                    key: 'free',
                    label: t('floorFree'),
                    value: room.free,
                    colour: 'var(--success-500)',
                  },
                  ...(room.reserved === null
                    ? []
                    : [
                        {
                          key: 'reserved',
                          label: t('floorReserved'),
                          value: room.reserved,
                          colour: 'var(--brand-200)',
                        },
                      ]),
                  ...(room.cleaning === null
                    ? []
                    : [
                        {
                          key: 'cleaning',
                          label: t('floorCleaning'),
                          value: room.cleaning,
                          colour: 'var(--n-300)',
                        },
                      ]),
                ]}
              />
            )}
          </Panel>

          <Panel>
            <PanelHead title={t('onShift')} subtitle={data.live ? undefined : t('onShiftSub')} />

            {/*
              A count, not six names. `Roster` publishes `onShiftCount()` and
              nothing richer on purpose — *"names, roles and lateness are
              personnel data and stay behind the Staff module's own
              permissions"* — so a live panel says how many are in and the
              fixture keeps the design's roster.
            */}
            {data.live ? (
              <EmptyState className="py-4">
                {data.onShiftCount === null
                  ? t('onShiftUnknown')
                  : t('onShiftLive', { count: data.onShiftCount })}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-0.5">
                {data.onShift.map((person) => (
                  <div
                    key={person.id}
                    data-row
                    className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-2"
                  >
                    <span
                      aria-hidden
                      className="bg-bg-muted text-fg-muted rounded-pill text-2xs grid size-7 flex-none place-items-center font-semibold"
                    >
                      {person.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{person.name}</span>
                      <span className="text-fg-subtle text-2xs block">
                        {roleName(`${person.role}.name`)}
                      </span>
                    </span>
                    <span data-num className="text-fg-subtle flex-none text-xs">
                      {person.from}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHead title={t('approvals')} subtitle={t('approvalsSub')} />

            {data.approvals.length === 0 ? (
              <EmptyState className="py-4">{t('approvalsEmpty')}</EmptyState>
            ) : (
              <ApprovalQueue
                items={data.approvals.map((approval) => ({
                  id: approval.id,
                  who: approval.who,
                  action: t(APPROVAL_LABEL[approval.action]),
                  amount: approval.amount === null ? null : formatTiyinAmount(approval.amount),
                  minutesAgo: approval.minutesAgo,
                }))}
                labels={{
                  approve: t('approve'),
                  decline: t('decline'),
                  approved: t('approved'),
                  declined: t('declined'),
                  reason: t.raw('approvalReason') as string,
                  pinTitle: pin('title'),
                  pinSub: pin('sub'),
                  cancel: pin('cancel'),
                  digitsEntered: pin.raw('digits') as string,
                }}
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
