import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  CellBar,
  EmptyState,
  KpiCard,
  KpiRow,
  PageHead,
  Panel,
  PanelHead,
  StatusChip,
} from '@restaurant/ui';

import { todayLabel } from '@/lib/today-label';

import { type Period } from './overview-data';
import { PeriodToggle } from './period-toggle';
import { GLYPH } from './kpi-icons';

import { ORDER_STATUS_TONE, type OrderStatus } from './overview-data';
import { type MyTable, type TableStatus } from './waiter-data';
import { getWaiterLive } from './dashboard-server';
import { delta, rail, show } from './figures';

/**
 * The waiter's shift screen.
 *
 * The design's §3.2 row for this role, and the one dashboard whose job is to be
 * left: four figures against the shift target, the orders that are still moving,
 * the six tables they hold, and a full-width button onto the floor.
 *
 * Status on a table card is carried by fill, border style, icon *and* label —
 * the design's §3.5 table and its accessibility rule agree on this, and a card
 * that says only "amber" is a card a colour-blind waiter reads as "grey".
 */
export async function WaiterDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, shared, floor] = await Promise.all([
    getWaiterLive(period),
    getTranslations('console.dashWaiter'),
    getTranslations('console.dashboard'),
    getTranslations('console.floor'),
  ]);

  const status = await getTranslations('console.orderStatus');

  return (
    <>
      <PageHead
        eyebrow={todayLabel(await getLocale(), new Date())}
        title={t('greeting', { name: data.greetingName })}
        lede={data.live ? t('ledeLive', { count: data.openOrders ?? 0 }) : t('lede')}
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
          Four shift targets — 22 tickets, 64 covers, 3 200 000 so'm, a 120 000
          average — none of them set by this restaurant. No rail on a live
          shift, and the `+9.6%` chip goes too: it was the same number for every
          waiter on every day.
        */}
        <KpiCard
          label={t('kMyOrders')}
          {...GLYPH.orders}
          value={show(data.myOrders, formatNumber)}
          unit={data.openOrders === null ? undefined : `${data.openOrders} ${t('open')}`}
          attainment={rail(data.live, data.myOrders, 22)}
          target={t('targetOrders')}
          railTone="brand"
        />
        <KpiCard
          label={t('kMyCovers')}
          {...GLYPH.guests}
          value={show(data.covers, formatNumber)}
          unit={t('guests')}
          attainment={rail(data.live, data.covers, 64)}
          target={t('targetCovers')}
          railTone="accent"
        />
        <KpiCard
          label={t('kMySales')}
          {...GLYPH.revenueGood}
          value={show(data.sales, formatTiyinAmount)}
          unit={t('som')}
          attainment={rail(data.live, data.sales, 3_200_000 * 100)}
          target={t('targetSales')}
          railTone="brand"
        />
        <KpiCard
          label={t('kMyAov')}
          {...GLYPH.average}
          value={show(data.averageTicket, formatTiyinAmount)}
          unit={t('som')}
          delta={delta(data.live, '+9.6%')}
          deltaTone="success"
          attainment={rail(data.live, data.averageTicket, 120_000 * 100)}
          target={t('targetAov')}
          railTone="accent"
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead title={t('myOrders')} subtitle={t('myOrdersSub')} />

            {data.orders.length === 0 ? (
              <EmptyState className="py-4">{t('myOrdersEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-0.5">
                {data.orders.map((order) => (
                  <Link
                    key={order.id}
                    href="/pos"
                    data-row
                    className="-mx-2 flex items-center gap-3.5 rounded-sm px-2 py-2.5"
                  >
                    <span data-num className="w-[62px] flex-none text-sm font-semibold">
                      {order.id}
                    </span>
                    <span className="text-fg-muted w-[52px] flex-none text-sm">{order.table}</span>
                    <span
                      className={`rounded-pill text-2xs flex-none px-2 py-[3px] font-semibold ${ORDER_STATUS_TONE[order.status]}`}
                    >
                      {status(order.status satisfies OrderStatus)}
                    </span>
                    <span data-num className="text-fg-subtle flex-1 text-right text-xs">
                      {order.minutesAgo}′
                    </span>
                    <span data-num className="w-[104px] flex-none text-right text-sm font-semibold">
                      {formatTiyinAmount(order.total)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            {/* The subtitle used to say "six tables assigned" whatever was
                below it. It counts, or it says where the list comes from. */}
            <PanelHead
              title={t('myTables')}
              subtitle={data.live ? t('myTablesSubLive') : t('myTablesSub')}
            />

            {data.tables.length === 0 ? (
              <EmptyState className="py-4">{t('myTablesEmpty')}</EmptyState>
            ) : (
              <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(158px,100%),1fr))] gap-3">
                {data.tables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    label={{
                      toPay: floor('statusToPay'),
                      seated: floor('statusSeated'),
                      reserved: floor('statusReserved'),
                      cleaning: floor('statusCleaning'),
                      free: floor('statusFree'),
                    }}
                    seats={t('seats')}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* The point of the screen. Full width, 52px, the one filled button —
              a waiter opens this dashboard in order to leave it. */}
          <Link
            href="/pos"
            className="bg-brand-500 hover:bg-brand-600 flex flex-col items-center justify-center rounded-lg px-5 py-6 text-center text-white"
          >
            <span className="font-display tracking-snug text-xl font-semibold">{t('goPos')}</span>
            <span className="mt-1 text-xs opacity-85">{t('goPosSub')}</span>
          </Link>

          <Panel>
            <PanelHead title={t('myTop')} subtitle={t('myTopSub')} />

            {data.topSellers.length === 0 ? (
              <EmptyState className="py-4">{t('myTopEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                {data.topSellers.map((seller) => (
                  <div key={seller.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {seller.name}
                    </span>
                    <CellBar
                      percent={seller.share * 100}
                      fill="var(--brand-500)"
                      label={seller.name}
                      className="max-w-[70px] flex-none"
                    />
                    <span data-num className="w-7 flex-none text-right text-sm font-semibold">
                      {formatNumber(seller.units)}
                    </span>
                  </div>
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
 * The visual treatment per status, from the design's §3.5 table.
 *
 * Fill *and* border style *and* an icon, never colour on its own. The dashed
 * border on a reservation and the hatched edge on a table being cleaned are
 * what a reader distinguishes when the tints are all they can see.
 */
const TABLE_STYLE: Record<TableStatus, string> = {
  free: 'bg-surface border-border',
  seated: 'bg-brand-50 border-brand-200',
  reserved: 'bg-surface border-brand-300 border-dashed',
  cleaning: 'bg-bg-muted border-border',
  toPay: 'bg-warning-50 border-warning-500',
};

const TABLE_TONE: Record<TableStatus, 'neutral' | 'brand' | 'warning'> = {
  free: 'neutral',
  seated: 'brand',
  reserved: 'brand',
  cleaning: 'neutral',
  toPay: 'warning',
};

function TableCard({
  table,
  label,
  seats,
}: {
  table: MyTable;
  label: Record<TableStatus, string>;
  seats: string;
}) {
  return (
    <Link
      href="/pos"
      className={`flex flex-col rounded-md border p-3.5 ${TABLE_STYLE[table.status]}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span data-num className="font-display text-2xl leading-none font-bold tracking-tight">
          {table.number}
        </span>
        <span data-num className="text-fg-subtle text-2xs">
          {table.seats} {seats}
        </span>
      </div>

      <StatusChip tone={TABLE_TONE[table.status]} dot className="mt-2.5">
        {label[table.status]}
      </StatusChip>

      {table.bill === null ? null : (
        <div data-num className="mt-2.5 text-sm font-semibold">
          {formatTiyinAmount(table.bill)}
        </div>
      )}

      {table.since === null ? null : (
        <div data-num className="text-fg-subtle text-2xs mt-px">
          {table.since}
          {table.guests === null ? null : ` · ${table.guests}`}
        </div>
      )}
    </Link>
  );
}
