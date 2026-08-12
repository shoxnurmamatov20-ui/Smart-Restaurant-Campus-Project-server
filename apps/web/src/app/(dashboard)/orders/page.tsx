import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { ORDER_STATUS_TONE } from '../dashboard/overview-data';
import { moduleMetadata } from '../module-page';
import { getOrderRows, ORDER_TABS, type OrderRow } from './orders-data';

export const generateMetadata = () => moduleMetadata('orders');

/**
 * The order list.
 *
 * Built to the design's Orders screen: a 24px heading over a muted count line,
 * three actions on the right, an underlined tab strip that the table hangs off
 * — the table has no top border and no top radius, so the strip and the table
 * read as one object — then the rows and a pager.
 *
 * The column widths are the design's own, in the order it declares them:
 * `96px 1fr 130px 116px 130px 96px 116px 40px`. Pixels rather than fractions
 * because an order id, a waiter's name and a time are all fixed-width things,
 * and letting them breathe with the window would make the money column wander.
 *
 * A server component; `ORDERS` is the seam the API lands in.
 *
 * TODO — Phase 1 · orders, once the module is built:
 *   - Live board over Reverb, so a new ticket appears without a reload
 *   - The waiter's terminal: add a dish, a note, a course order
 *   - Split and merge bills
 *   - Void and refund, with a reason and an approval
 *   - Delivery: address, courier, promised time
 */
const COLUMNS = '[grid-template-columns:96px_1fr_130px_116px_130px_96px_116px_40px]';

const QUIET =
  'bg-surface hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-medium whitespace-nowrap';

export default async function OrdersPage() {
  const [nav, t, status, common] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.orders'),
    getTranslations('console.orderStatus'),
    getTranslations('console.common'),
  ]);
  const shell = await getTranslations('console.shell');

  // The API when there is a session, the fixtures when there is not — the seam
  // is inside getOrderRows(), so this screen never learns which it got.
  const orders = await getOrderRows(t);

  return (
    <>
      <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{nav('orders')}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{t('subtitle')}</p>
        </div>

        <div data-pageactions className="flex flex-none gap-2.5">
          <button type="button" className={`${QUIET} flex items-center gap-2`}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            {common('filters')}
          </button>
          <button type="button" className={QUIET}>
            {common('export')}
          </button>
          <button
            type="button"
            className="bg-brand-500 hover:bg-brand-600 h-9 flex-none rounded-md px-3.5 text-sm font-semibold whitespace-nowrap text-white"
          >
            {shell('newOrder')}
          </button>
        </div>
      </div>

      {/* The strip sits on the table's top border; -1px lets the active
          underline cover that line rather than stack on top of it. */}
      <div className="mb-0.5 flex items-center gap-5 border-b">
        {ORDER_TABS.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            className={`-mb-px border-b-2 px-0.5 pt-2.5 pb-3 text-sm font-medium ${
              index === 0 ? 'border-brand-500 text-fg' : 'text-fg-muted border-transparent'
            }`}
          >
            {t(tab.key)}{' '}
            <span data-num className="text-fg-subtle font-medium">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div data-table className="bg-surface overflow-hidden rounded-b-lg border border-t-0">
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} gap-4 border-b px-5 py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{t('colOrder')}</span>
          <span>{t('colWhere')}</span>
          <span>{t('colWaiter')}</span>
          <span>{t('colItems')}</span>
          <span>{t('colStatus')}</span>
          <span>{t('colOpened')}</span>
          <span className="text-right">{t('colTotal')}</span>
          <span />
        </div>

        {orders.map((order) => (
          <div
            key={order.id}
            data-row
            className={`border-divider grid ${COLUMNS} items-center gap-4 border-b px-5 py-3.5`}
          >
            <span className="text-fg-muted font-mono text-sm">{order.id}</span>

            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{order.where}</span>
              <span className="text-fg-subtle mt-0.5 block text-xs">{detail(order, t)}</span>
            </span>

            <span className="text-fg-muted text-sm">
              {order.waiter === 'system' ? t('system') : order.waiter}
            </span>
            <span data-num className="text-fg-muted text-sm">
              {order.items}
            </span>

            <span>
              <span
                className={`rounded-pill text-2xs inline-flex items-center gap-1.5 px-[9px] py-1 font-semibold ${ORDER_STATUS_TONE[order.status]}`}
              >
                <span aria-hidden className="rounded-pill size-[5px] bg-current" />
                {status(order.status)}
              </span>
            </span>

            <span data-num className="text-fg-muted text-sm">
              {order.time}
            </span>
            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(order.total)}
            </span>

            <span className="text-fg-disabled flex justify-end">
              <Chevron />
            </span>
          </div>
        ))}

        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <span className="text-fg-subtle text-xs">{t('showing')}</span>

          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              disabled
              aria-label="←"
              className="text-fg-disabled grid size-8 place-items-center rounded-sm border"
            >
              <Chevron flip />
            </button>

            {[1, 2, 3].map((page) => (
              <button
                key={page}
                type="button"
                data-num
                className={`grid h-8 min-w-8 place-items-center rounded-sm border px-2 text-sm ${
                  page === 1
                    ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                    : 'text-fg-muted hover:bg-bg-subtle'
                }`}
              >
                {page}
              </button>
            ))}

            <span className="text-fg-disabled px-1.5 text-sm">…</span>

            <button
              type="button"
              aria-label="→"
              className="text-fg-muted hover:bg-bg-subtle grid size-8 place-items-center rounded-sm border"
            >
              <Chevron />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** The second line under a table name: covers for a room, address for a run. */
function detail(order: OrderRow, t: (key: string) => string): string {
  if (order.channel === 'delivery') return `${t('delivery')} · ${order.detail}`;
  if (order.channel === 'counter') return t('counter');

  return `${t('dineIn')} · ${order.detail}`;
}

function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={flip ? 'rotate-180' : undefined}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
