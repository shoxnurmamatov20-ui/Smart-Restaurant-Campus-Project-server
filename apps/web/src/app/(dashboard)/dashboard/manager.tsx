import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
  Segmented,
  StatusChip,
} from '@restaurant/ui';

import { getManagerOverview, type Approval, type StationRow } from './manager-data';

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
export async function ManagerDashboard() {
  const [data, t, shared, station, perm, roleName] = await Promise.all([
    getManagerOverview(),
    getTranslations('console.dashManager'),
    getTranslations('console.dashboard'),
    getTranslations('console.kitchen'),
    getTranslations('console.permissions'),
    getTranslations('console.roles'),
  ]);

  const STATION_LABEL: Record<StationRow['id'], string> = {
    grill: station('stationGrill'),
    hot: station('stationHot'),
    cold: station('stationCold'),
    bar: station('stationBar'),
  };

  const busiest = Math.max(...data.waiters.map((waiter) => waiter.revenue));

  return (
    <>
      <PageHead
        eyebrow={shared('date')}
        title={t('greeting', { name: data.greetingName })}
        lede={t('lede')}
        action={
          <Segmented
            aria-label={shared('kpiLabel')}
            segments={[
              { value: 'today', label: shared('periodToday') },
              { value: 'week', label: shared('periodWeek') },
              { value: 'month', label: shared('periodMonth') },
            ]}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        <KpiCard
          label={t('kOpen')}
          value={formatNumber(data.openOrders)}
          unit={t('tickets')}
          attainment={(data.openOrders / 18) * 100}
          target={t('targetOpen')}
          railTone="brand"
        />
        <KpiCard
          label={t('kWait')}
          value={formatNumber(data.averageWaitMinutes)}
          unit={t('minutes')}
          delta={data.averageWaitMinutes <= 12 ? '−3' : '+2'}
          deltaTone={data.averageWaitMinutes <= 12 ? 'success' : 'danger'}
          attainment={(data.averageWaitMinutes / 12) * 100}
          target={t('targetWait')}
          railTone={data.averageWaitMinutes <= 12 ? 'success' : 'danger'}
        />
        <KpiCard
          label={t('kCancelled')}
          value={formatNumber(data.cancelled)}
          unit={t('tickets')}
          attainment={(data.cancelled / 2) * 100}
          target={t('targetCancel')}
          railTone={data.cancelled <= 2 ? 'success' : 'danger'}
        />
        <KpiCard
          label={t('kCovers')}
          value={formatNumber(data.covers)}
          unit={t('guests')}
          attainment={(data.covers / 260) * 100}
          target={t('targetCovers')}
          railTone="accent"
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        {/* ---- primary ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead title={t('waiters')} subtitle={t('waitersSub')} />

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
          </Panel>

          <Panel>
            <PanelHead title={t('stations')} subtitle={t('stationsSub')} />

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

            <Donut
              total={formatNumber(data.floor.total)}
              totalLabel={t('floorTotal')}
              slices={[
                {
                  key: 'busy',
                  label: t('floorBusy'),
                  value: data.floor.busy,
                  colour: 'var(--brand-500)',
                },
                {
                  key: 'free',
                  label: t('floorFree'),
                  value: data.floor.free,
                  colour: 'var(--success-500)',
                },
                {
                  key: 'reserved',
                  label: t('floorReserved'),
                  value: data.floor.reserved,
                  colour: 'var(--brand-200)',
                },
                {
                  key: 'cleaning',
                  label: t('floorCleaning'),
                  value: data.floor.cleaning,
                  colour: 'var(--n-300)',
                },
              ]}
            />
          </Panel>

          <Panel>
            <PanelHead title={t('onShift')} subtitle={t('onShiftSub')} />

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
          </Panel>

          <Panel>
            <PanelHead title={t('approvals')} subtitle={t('approvalsSub')} />

            {data.approvals.length === 0 ? (
              <EmptyState className="py-4">{t('approvalsEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                {data.approvals.map((approval) => (
                  <ApprovalRow
                    key={approval.id}
                    approval={approval}
                    action={perm(approval.action)}
                    approve={t('approve')}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * One request waiting on a manager's PIN.
 *
 * The amount is stated because that is what the decision turns on, and the
 * requester is named because an approval that does not record who asked is not
 * an audit trail. The design logs approver, requester, amount and timestamp —
 * this row shows three of the four, and the fourth is the moment it is pressed.
 */
function ApprovalRow({
  approval,
  action,
  approve,
}: {
  approval: Approval;
  action: string;
  approve: string;
}) {
  return (
    <div className="bg-warning-50 flex items-start gap-3 rounded-md border p-3.5">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--warning-600)"
        strokeWidth="2"
        strokeLinecap="round"
        className="mt-px flex-none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5l3 2" />
      </svg>

      <div className="min-w-0 flex-1">
        <div className="text-warning-700 text-sm font-semibold">{action}</div>
        <p className="text-warning-700 mt-1 text-xs leading-normal opacity-85">
          {approval.who}
          {approval.amount === null ? null : (
            <>
              {' · '}
              <span data-num>{formatTiyinAmount(approval.amount)}</span>
            </>
          )}
        </p>

        {/* TODO(api): POST /api/v1/approvals/{id} behind the design's 4-digit
            keypad modal. The button is the shape; the modal lands with the
            endpoint, because an approval granted without one is not logged. */}
        <button
          type="button"
          className="bg-warning-500 mt-2.5 h-8 rounded-md px-3 text-xs font-semibold text-white"
        >
          {approve}
        </button>
      </div>

      <StatusChip tone="warning" className="flex-none">
        {approval.minutesAgo}′
      </StatusChip>
    </div>
  );
}
