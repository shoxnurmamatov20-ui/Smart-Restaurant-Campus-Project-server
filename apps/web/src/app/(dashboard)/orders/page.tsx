import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { getSession } from '@/lib/session';

import { CHANNEL_FILTERS, ORDER_RAIL, STATUS_FILTERS, type OrderRow } from './orders-data';
import { OrderControls } from './orders-controls';
import { OrdersTable } from './orders-table';
import { getBillRates, getOrderCounts, getOrders } from './orders-server';

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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, status, common, act, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.orders'),
    getTranslations('console.orderStatus'),
    getTranslations('console.common'),
    getTranslations('console.actions'),
    getLocale(),
  ]);

  /*
   * The narrowing, out of the URL.
   *
   * A selection is a place: it survives a refresh and it can be sent to
   * whoever asked the question. Applied on the SERVER because the list is paged
   * upstream — a filter applied in the browser would narrow one page of a
   * hundred and present the result as the answer.
   */
  const query = await searchParams;
  const one = (key: string): string | undefined => {
    const value = query[key];

    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  const filters = {
    channel: one('channel'),
    status: one('status'),
    waiter: one('waiter'),
    intake: one('intake'),
  };

  // The API when there is a session, the fixtures when there is not — the seam
  // is inside getOrders(), so this screen never learns which it got. `ids` is
  // what the drawer needs to read a bill's real lines and write to it; `tables`
  // and `waiters` are what the transfer sheet offers to move it to.
  const [{ rows: orders, ids, tables, waiters }, counts, rates, session] = await Promise.all([
    getOrders(t, filters),
    // Two counted reads for the caption — see getOrderCounts(). The line used
    // to be a catalogue sentence claiming twelve open bills over an empty
    // table.
    getOrderCounts(),
    // This restaurant's own VAT and service rates, so the drawer's arithmetic
    // and the two labels beside it agree with each other and with the receipt.
    getBillRates(),
    getSession(),
  ]);

  const subtitle =
    counts === null ? t('subtitle') : t('subtitleLive', { ...counts, place: session.placeName });

  /*
   * The table's own column, formatted here.
   *
   * `formatTiyinAmount` needs the locale and the locale lives on the server;
   * shipping the formatter to render three dozen settled figures is a cost with
   * no return. The drawer's amounts are not here for the opposite reason: its
   * lines are fetched after a click, so nothing on the server has seen them.
   */
  const amounts = Object.fromEntries(
    orders.map((order) => [`total_${order.id}`, formatTiyinAmount(order.total)]),
  );

  return (
    <>
      <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{nav('orders')}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
        </div>

        {/*
          The design's two head buttons, and both open something now. See
          ./orders-controls.tsx: filtering writes `filter[...]` into the URL and
          the list is re-read narrowed on the server; "New order" opens a BILL —
          which conversation, whose number, where it is going — and the terminal
          adds the dishes to it.
        */}
        <OrderControls
          lang={locale as 'uz' | 'ru' | 'en'}
          canCreate={Object.keys(ids).length > 0 || tables.length > 0}
          channels={CHANNEL_FILTERS.map((key) => ({ value: key, label: t(`channel_${key}`) }))}
          statuses={STATUS_FILTERS.map((key) => ({ value: key, label: status(key) }))}
          waiters={waiters.map((person) => ({ value: String(person.id), label: person.label }))}
          tables={tables.map((table) => ({ value: String(table.id), label: table.label }))}
          labels={{
            filters: t('filters'),
            filterAny: t('filterAny'),
            filterClear: t('filterClear'),
            newOrder: t('newOrder'),
            newTable: t('newTable'),
            newGuests: t('newGuests'),
            newName: t('newName'),
            newPhone: t('newPhone'),
            newAddress: t('newAddress'),
            newAddressNeeded: t('newAddressNeeded'),
            newHint: t('newHint'),
            newOpen: t('newOpen'),
            newOpening: t('newOpening'),
            newOpened: t.raw('newOpened') as string,
            newFailed: t('newFailed'),
            colWhere: t('colWhere'),
            colStatus: t('colStatus'),
            colWaiter: t('colWaiter'),
          }}
        />
      </div>

      <OrdersTable
        rows={orders}
        ids={ids}
        tables={tables}
        waiters={waiters}
        money={amounts}
        rates={rates}
        labels={{
          tabActive: t('tabActive'),
          tabReady: t('tabReady'),
          tabPaid: t('tabPaid'),
          tabVoided: t('tabVoided'),

          colOrder: t('colOrder'),
          colWhere: t('colWhere'),
          colWaiter: t('colWaiter'),
          colItems: t('colItems'),
          colStatus: t('colStatus'),
          colOpened: t('colOpened'),
          colTotal: t('colTotal'),

          system: t('system'),
          showing: t.raw('showing') as string,
          previous: common('previous'),
          next: common('next'),
          close: common('close'),

          export: common('export'),
          exportTitle: common('exportTitle'),
          exportBody: common('exportBody'),
          exportRows: common.raw('exportRows') as string,
          exportFormat: common('exportFormat'),
          exportCsv: common('exportCsv'),
          exportExcelFormat: common('exportExcelFormat'),
          exportDownload: common('exportDownload'),
          exportNote: common('exportNote'),
          // `console.common` has no `cancel` — it never did, and this line has
          // been rendering the key path into the export dialog's own button.
          // The word now lives beside the four confirm sheets that also need
          // it, rather than being added to a catalogue five other screens read.
          cancel: t('cancel'),

          emptyTab: t('emptyTab'),
          emptyTabSub: t('emptyTabSub'),
          emptyVoided: t('emptyVoided'),

          waiter: t('colWaiter'),
          noLines: t('noLines'),
          subtotal: t('subtotal'),
          service: t('serviceRate', { percent: rates.service }),
          total: t('colTotal'),
          // `{percent}` is resolved here and `{amount}` in the drawer, which
          // is the only one of the two the browser knows.
          vat: (t.raw('vatRate') as string).replace('{percent}', String(rates.vat)),
          actionsNote: t('actionsNote'),
          // `console.actions.reprinted` is the catalogue's own line for a copy
          // of a receipt and is already used by the till; the other four say
          // what they did in this screen's own words, because "voided" and
          // "moved" are sentences about an order rather than about paper.
          reprinted: act('reprinted'),

          // The confirm sheet the other four open — ./order-actions.tsx.
          ...Object.fromEntries(
            (
              [
                // `cancel` is up with the export dialog's keys — it is shared
                // with that button and only listed once.
                'reason',
                'reasonShort',
                'apply',
                'discountByPercent',
                'discountByAmount',
                'discountAmountLabel',
                'transferTable',
                'transferWaiter',
                'transferNowhere',
                'approvalTitle',
                'approvalRetry',
                'refundNothing',
                'refundSeveral',
              ] as const
            ).map((key) => [key, t(key)]),
          ),
          ...Object.fromEntries(
            (['void', 'refund', 'discount', 'transfer'] as const).flatMap((action) => [
              [`confirm_${action}`, t(`confirm_${action}`)],
              [`sub_${action}`, t(`sub_${action}`)],
              [`done_${action}`, t(`done_${action}`)],
            ]),
          ),

          ...Object.fromEntries(
            ORDER_RAIL.map((step) => [`rail_${step}`, status(step === 'paid' ? 'paid' : step)]),
          ),
          ...Object.fromEntries(
            (['sent', 'cooking', 'ready', 'served'] as const).map((state) => [
              `line_${state}`,
              t(`line_${state}`),
            ]),
          ),
          ...Object.fromEntries(
            (['print', 'void', 'refund', 'discount', 'transfer'] as const).map((action) => [
              `action_${action}`,
              t(`action_${action}`),
            ]),
          ),
          ...Object.fromEntries(orders.map((order) => [`detail_${order.id}`, detail(order, t)])),
          ...Object.fromEntries(
            orders.map((order) => [`status_${order.status}`, status(order.status)]),
          ),
        }}
      />
    </>
  );
}

/** The second line under a table name: covers for a room, address for a run. */
function detail(order: OrderRow, t: (key: string) => string): string {
  if (order.channel === 'delivery') return `${t('delivery')} · ${order.detail}`;
  if (order.channel === 'counter') return t('counter');

  return `${t('dineIn')} · ${order.detail}`;
}
