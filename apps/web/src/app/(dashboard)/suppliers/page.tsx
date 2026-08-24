import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinCompact } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { Pill, Row, TableCard, type Tone } from '../screen';
import { Tabs } from '../tabs';
import { NewOrderPanel } from './new-order';
import {
  isOpenPurchase,
  onTimeTone,
  ORDER_COPY,
  say,
  type Lang,
  type PurchaseStatus,
} from './suppliers-data';
import { STORE_COPY, type StockRow } from '../inventory/inventory-data';
import {
  getOrderPad,
  getPurchaseOrders,
  getSuppliers,
  supplierFacts,
  suppliersAreLive,
} from './suppliers-server';

export const generateMetadata = () => moduleMetadata('suppliers');

/**
 * Who the restaurant buys from.
 *
 * Built to the design's Suppliers screen. The on-time column is the one that
 * earns the table its place: a supplier at 82% is not a price problem, it is a
 * kitchen that has to hold more stock than it wants to, and the colour says so
 * without anyone running a report.
 *
 * Below it, the order book. Both halves read the API — the on-time figure,
 * the open count and the quarter's spend are computed there from the orders
 * that were actually received, so they cannot go stale the way a stored column
 * would.
 *
 * TODO — Phase 1 · suppliers, once the module is built:
 *   - Price lists, and what changed since last time
 *   - Payables and the payment schedule
 *   - E-invoices through Didox
 */
const COLUMNS =
  '[grid-template-columns:minmax(0,1.4fr)_140px_120px_120px_130px_minmax(0,1fr)_110px]';

const PO_COLUMNS = '[grid-template-columns:110px_minmax(0,1.5fr)_130px_90px_150px_130px]';

/** The five states, and how loudly each is drawn. */
const PO_TONE: Readonly<Record<PurchaseStatus, Tone>> = {
  draft: 'neutral',
  sent: 'neutral',
  confirmed: 'brand',
  received: 'success',
  cancelled: 'danger',
};

const PO_LABEL = {
  draft: 'poDraft',
  sent: 'poSent',
  confirmed: 'poConfirmed',
  received: 'poReceived',
  cancelled: 'poCancelled',
} as const;

const TONE_TEXT = {
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
  // Nothing has arrived from them yet, so the figure is an em dash rather than
  // a colour — see onTimeTone.
  muted: 'text-fg-muted',
} as const;

export default async function SuppliersPage() {
  const [nav, t, common, locale, blank] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.suppliers'),
    getTranslations('console.common'),
    getLocale(),
    getTranslations('console.empty'),
  ]);

  const lang = locale as Lang;

  /*
   * The unit a quantity is counted in, in the reader's words.
   *
   * Three of the four are console catalogue keys; the case is not, and cannot
   * be until the catalogue grows a word for it — the same pair the store screen
   * resolves. Resolved on the server so no catalogue crosses into the pad.
   */
  const inventory = await getTranslations('console.inventory');
  const unitWord = (row: StockRow): string =>
    row.unit === 'unitCase' ? say(STORE_COPY.unitCase, lang) : inventory(row.unit);

  // The API when there is a session, the fixtures when there is not.
  const [suppliers, orders, pad] = await Promise.all([
    getSuppliers(),
    getPurchaseOrders(),
    getOrderPad(
      unitWord,
      {
        cash: say(ORDER_COPY.termsCash, lang),
        net: say(ORDER_COPY.termsNet, lang),
      },
      lang,
    ),
  ]);

  /*
   * The line under the title, counted rather than recited. The catalogue's
   * sentence told a tenant with no suppliers that it had six of them and had
   * spent 117 million so'm this quarter.
   */
  const facts = supplierFacts(suppliers, orders, suppliersAreLive(suppliers));
  const subtitle =
    facts === null
      ? t('subtitle')
      : t('subtitleCount', { ...facts, spend: Math.round(facts.spend / 100_000_000) });
  const money = (tiyin: number) => formatTiyinCompact(tiyin, lang);
  const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });

  return (
    <>
      <Tabs
        ariaLabel={nav('suppliers')}
        title={nav('suppliers')}
        subtitle={subtitle}
        /*
         * `poNewBtn` in the design, and it goes where its name says. Payables
         * are not in this head at all: the design keeps them in Books, which is
         * where the person who pays them works.
         */
        actions={[{ label: say(ORDER_COPY.newBtn, lang), tab: 'new', primary: true }]}
        tabs={[
          { key: 'suppliers', label: t('tabSuppliers') },
          { key: 'orders', label: t('tabOrders') },
          { key: 'new', label: say(ORDER_COPY.tabNew, lang) },
        ]}
        panels={{
          suppliers: (
            <TableCard
              columns={COLUMNS}
              head={[
                t('colSupplier'),
                t('colCategory'),
                t('colLead'),
                { label: t('colOnTime'), align: 'right' },
                t('colPurchases'),
                t('colContact'),
                { label: t('colSpend'), align: 'right' },
              ]}
              empty={{ title: blank('suppliers'), body: blank('suppliersSub') }}
            >
              {suppliers.map((supplier) => (
                <Row key={supplier.id} columns={COLUMNS}>
                  <span className="truncate text-sm font-semibold">{supplier.name}</span>
                  <span className="text-fg-muted text-sm">{t(supplier.category)}</span>
                  <span className="text-fg-muted text-sm">{t(supplier.lead)}</span>

                  <span
                    data-num
                    className={`text-right text-sm font-semibold ${TONE_TEXT[onTimeTone(supplier.onTime)]}`}
                  >
                    {supplier.onTime === null ? '—' : `${supplier.onTime}%`}
                  </span>

                  <span data-num className="text-fg-muted text-sm">
                    {supplier.openPurchases === 0
                      ? '—'
                      : `${supplier.openPurchases} ${common('open')}`}
                  </span>

                  <span data-num className="text-fg-muted text-sm whitespace-nowrap">
                    {supplier.contact}
                  </span>

                  {/* Millions to one decimal — the design's shorthand for a spend
                  column, so six figures stay a column rather than a wall. */}
                  <span data-num className="text-right text-sm font-semibold">
                    {(supplier.spend / 100_000_000).toFixed(1)}M
                  </span>
                </Row>
              ))}
            </TableCard>
          ),
          orders: (
            <TableCard
              columns={PO_COLUMNS}
              head={[
                t('poColNumber'),
                t('poColSupplier'),
                t('poColExpected'),
                { label: t('poColLines'), align: 'right' },
                t('poColStatus'),
                { label: t('poColTotal'), align: 'right' },
              ]}
            >
              {orders.map((order) => {
                // Open, and the day it was promised for has passed. The only thing on
                // this table worth a colour: everything else is a state a buyer chose,
                // and this is the one that chose itself.
                const late =
                  isOpenPurchase(order) && order.expected !== null && order.expected < todayIso();

                return (
                  <Row key={order.id} columns={PO_COLUMNS} className="py-3">
                    <span className="text-fg-subtle font-mono text-xs">{order.number}</span>
                    <span className="truncate text-sm font-semibold">{order.supplier}</span>

                    <span
                      data-num
                      className={`text-sm ${late ? 'text-danger-700 font-semibold' : 'text-fg-muted'}`}
                    >
                      {order.expected === null
                        ? t('poNoDate')
                        : date.format(new Date(`${order.expected}T00:00:00`))}
                    </span>

                    <span data-num className="text-fg-muted text-right text-sm">
                      {order.lines}
                    </span>

                    <span>
                      <Pill tone={PO_TONE[order.status]}>{t(PO_LABEL[order.status])}</Pill>
                    </span>

                    <span data-num className="text-right text-sm font-semibold">
                      {money(order.total)}
                    </span>
                  </Row>
                );
              })}
            </TableCard>
          ),
          new: <NewOrderPanel pad={pad} lang={lang} />,
        }}
      />
    </>
  );
}

/** Today as `YYYY-MM-DD`, which sorts and compares as a plain string. */
function todayIso(): string {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}
