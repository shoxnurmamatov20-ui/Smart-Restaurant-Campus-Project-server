'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { ExportDialog } from '../export-dialog';

import { billTotals } from '@restaurant/surfaces/money';
import { post } from '@/lib/console-post';

import {
  OrderActionSheet,
  type ActionPayload,
  type OrderAction,
  type Choice,
  type Refusal,
} from './order-actions';

import { ORDER_STATUS_TONE } from '../dashboard/overview-data';
import {
  ORDER_LINES,
  ORDER_RAIL,
  ORDER_TABS,
  railIndex,
  type OrderLine,
  rowsFor,
  type OrderRow,
  type OrderTabKey,
} from './orders-data';

/**
 * The orders table, its tabs, its pager — and the drawer a row opens.
 *
 * All four were drawn and inert: the tab strip hardcoded the first tab active,
 * the pager hardcoded page one, and the rows were `<div>`s. `specs/01-os.md
 * §5.2` puts the whole of an order behind a row click, and this is the screen a
 * manager spends the evening in.
 *
 * **The drawer's money is not recomputed here.** `lib/pricing` is the
 * transcription of the server's `BillTotals` and it is what draws the subtotal,
 * the ten per cent service and the VAT *inside* the total. Anything else would
 * be a second opinion about a bill the guest is holding.
 *
 * **All five actions write, and four of them ask first.** Print, void, refund,
 * discount and transfer are the design's. Three of them are the rows a
 * loss-prevention report is built out of, which is why none of those three
 * goes anywhere without a typed reason — the confirm step is in
 * ./order-actions.tsx, and it is the reason these buttons could not be wired
 * until `console.orders` had the words for it.
 */
const COLUMNS =
  '[grid-template-columns:96px_minmax(0,1.35fr)_minmax(0,0.9fr)_64px_150px_74px_128px_28px]';

export function OrdersTable({
  rows,
  labels,
  money,
  rates,
  ids = {},
  tables = [],
  waiters = [],
}: {
  rows: readonly OrderRow[];
  labels: Record<string, string>;
  /** Every total the table can show, formatted on the server. */
  money: Readonly<Record<string, string>>;
  /**
   * This restaurant's own VAT and service percentages — see `getBillRates()`.
   *
   * They reach the arithmetic AND the two labels beside it. Left to the
   * package defaults, the drawer would add a 10% service charge and caption a
   * 12% VAT for a restaurant on neither, which is a bill that disagrees with
   * its own receipt.
   */
  rates: { vat: number; service: number };
  /**
   * Where a bill can be moved and who can be handed it — see `OrderList` in
   * ./orders-server.ts. Empty on fixtures, which is what makes the transfer
   * sheet say it has nothing to offer rather than draw an empty grid.
   */
  tables?: readonly Choice[];
  waiters?: readonly Choice[];
  /**
   * Order number → row id. Empty when these rows are fixtures.
   *
   * `OrderRow.id` is the number a guest is told, not a key — see
   * `OrderList.ids` in ./orders-server.ts. An absent entry is what tells the
   * drawer it has nothing real to read or write about.
   */
  ids?: Readonly<Record<string, number>>;
}) {
  const [tab, setTab] = useState<OrderTabKey>('tabActive');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const PER_PAGE = 8;

  const shown = useMemo(() => rowsFor(rows, tab), [rows, tab]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const slice = shown.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const choose = (next: OrderTabKey) => {
    setTab(next);
    /* Page one on every tab change — page three of "voided" is empty. */
    setPage(1);
  };

  return (
    <>
      {/* The strip sits on the table's top border; -1px lets the active
          underline cover that line rather than stack on top of it.

          Export sits at the right of this row rather than up in the page head,
          which is one step from the design and deliberate: what it exports is
          *this tab's* rows, and a control that far from the thing it acts on is
          how a reader ends up with a file of the wrong eight orders. */}
      {/* `flex-wrap` because five tabs and an export button are wider than a
          phone: the row used to run 44px past the screen with "Bekor qilingan"
          and Export both off the side of it. */}
      <div className="mb-0.5 flex flex-wrap items-center gap-x-5 border-b">
        {ORDER_TABS.map((entry) => {
          const count = rowsFor(rows, entry.key).length;

          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => choose(entry.key)}
              className={`-mb-px border-b-2 px-0.5 pt-2.5 pb-3 text-sm font-medium ${
                tab === entry.key ? 'border-brand-500 text-fg' : 'text-fg-muted border-transparent'
              }`}
            >
              {labels[entry.key]} {/* Counted from the rows, never written beside the label. */}
              <span data-num className="text-fg-subtle font-medium">
                {count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setExporting(true)}
          className="border-border-strong hover:bg-bg-muted mb-2 ml-auto h-8 rounded-md border px-3 text-xs font-semibold"
        >
          {labels.export}
        </button>
      </div>

      <div data-table className="bg-surface overflow-hidden rounded-b-lg border border-t-0">
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} gap-4 border-b px-5 py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{labels.colOrder}</span>
          <span>{labels.colWhere}</span>
          <span>{labels.colWaiter}</span>
          <span>{labels.colItems}</span>
          <span>{labels.colStatus}</span>
          <span>{labels.colOpened}</span>
          <span className="text-right">{labels.colTotal}</span>
          <span />
        </div>

        {slice.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold">{labels.emptyTab}</p>
            <p className="text-fg-subtle mx-auto mt-1.5 max-w-[44ch] text-xs leading-normal">
              {tab === 'tabVoided' ? labels.emptyVoided : labels.emptyTabSub}
            </p>
          </div>
        ) : (
          slice.map((order) => (
            <button
              key={order.id}
              type="button"
              data-row
              onClick={() => setOpen(order)}
              className={`border-divider hover:bg-bg-subtle grid w-full ${COLUMNS} items-center gap-4 border-b px-5 py-3.5 text-left`}
            >
              <span className="text-fg-muted font-mono text-sm">{order.id}</span>

              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{order.where}</span>
                <span className="text-fg-subtle mt-0.5 block text-xs">
                  {labels[`detail_${order.id}`]}
                </span>
              </span>

              <span className="text-fg-muted text-sm">
                {order.waiter === 'system' ? labels.system : order.waiter}
              </span>
              <span data-num className="text-fg-muted text-sm">
                {order.items}
              </span>

              <span>
                <span
                  className={`rounded-pill text-2xs inline-flex items-center gap-1.5 px-[9px] py-1 font-semibold ${ORDER_STATUS_TONE[order.status]}`}
                >
                  <span aria-hidden className="rounded-pill size-[5px] bg-current" />
                  {labels[`status_${order.status}`]}
                </span>
              </span>

              <span data-num className="text-fg-muted text-sm">
                {order.time}
              </span>
              <span data-num className="text-right text-sm font-semibold">
                {money[`total_${order.id}`]}
              </span>

              <span className="text-fg-disabled flex justify-end">
                <Chevron />
              </span>
            </button>
          ))
        )}

        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <span className="text-fg-subtle text-xs">
            {labels.showing
              .replace('{from}', String(shown.length === 0 ? 0 : (safePage - 1) * PER_PAGE + 1))
              .replace('{to}', String(Math.min(safePage * PER_PAGE, shown.length)))
              .replace('{total}', String(shown.length))}
          </span>

          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
              aria-label={labels.previous}
              className="text-fg-muted disabled:text-fg-disabled hover:bg-bg-subtle grid size-8 place-items-center rounded-sm border disabled:hover:bg-transparent"
            >
              <Chevron flip />
            </button>

            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                data-num
                onClick={() => setPage(number)}
                aria-current={number === safePage ? 'page' : undefined}
                className={`grid h-8 min-w-8 place-items-center rounded-sm border px-2 text-sm ${
                  number === safePage
                    ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                    : 'text-fg-muted hover:bg-bg-subtle'
                }`}
              >
                {number}
              </button>
            ))}

            <button
              type="button"
              disabled={safePage === pages}
              onClick={() => setPage(safePage + 1)}
              aria-label={labels.next}
              className="text-fg-muted disabled:text-fg-disabled hover:bg-bg-subtle grid size-8 place-items-center rounded-sm border disabled:hover:bg-transparent"
            >
              <Chevron />
            </button>
          </div>
        </div>
      </div>

      {open === null ? null : (
        <OrderDrawer
          order={open}
          orderId={ids[open.id] ?? null}
          labels={labels}
          rates={rates}
          tables={tables}
          waiters={waiters}
          onClose={() => setOpen(null)}
        />
      )}

      {/*
       * The rows this tab is showing, not the page. A reader who filtered to
       * "voided" and exported the eight on screen would get a file that
       * contradicts the count above it.
       */}
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        filename={`orders-${tab}`}
        columns={[
          labels.colOrder,
          labels.colWhere,
          labels.colWaiter,
          labels.colItems,
          labels.colStatus,
          labels.colOpened,
          labels.colTotal,
        ]}
        rows={shown.map((row) => [
          row.id,
          `${row.where} · ${row.detail}`,
          row.waiter,
          String(row.items),
          labels[`status_${row.status}`] ?? row.status,
          row.time,
          money[`total_${row.id}`] ?? '',
        ])}
        labels={{
          title: labels.exportTitle,
          body: labels.exportBody,
          rowCount: labels.exportRows,
          format: labels.exportFormat,
          csv: labels.exportCsv,
          excel: labels.exportExcelFormat,
          download: labels.exportDownload,
          cancel: labels.cancel,
          note: labels.exportNote,
        }}
      />
    </>
  );
}

/** `GET /api/v1/orders/orders/{id}?include=items`, narrowed to what a line shows. */
type ApiLine = {
  id: number;
  title: string;
  quantity: number;
  /** Tiyin, per unit — the price this bill was rung up at, not today's menu. */
  unit_price: number;
  status: string;
  note: string | null;
};

/**
 * The kitchen's five line states against the four the drawer draws.
 *
 * `cancelled` is deliberately not mapped, and a line holding it is dropped
 * rather than shown: a voided line is not part of the bill and does not count
 * towards the subtotal, so drawing it would make the drawer's arithmetic
 * disagree with the total in the row above it. Anything unrecognised reads as
 * `sent`, which is the earliest of the four — a line whose state the server
 * grew should look un-cooked rather than served.
 */
const LINE_STATE: Readonly<Record<string, OrderLine['state']>> = {
  pending: 'sent',
  cooking: 'cooking',
  ready: 'ready',
  served: 'served',
};

/** The whole of one order — `specs/01-os.md §5.2`. */
function OrderDrawer({
  order,
  orderId,
  labels,
  rates,
  tables,
  waiters,
  onClose,
}: {
  order: OrderRow;
  /** The row behind this number, or null for a fixture. */
  orderId: number | null;
  labels: Record<string, string>;
  rates: { vat: number; service: number };
  tables: readonly Choice[];
  waiters: readonly Choice[];
  onClose: () => void;
}) {
  const lang = useLocale() as 'uz' | 'ru' | 'en';
  const router = useRouter();

  /*
   * The real lines, once they arrive.
   *
   * Fetched on open rather than carried on the list, because the table draws
   * forty rows and needs none of this — a list endpoint that returned every
   * line of every order would be a list nobody could page. Null until the
   * answer lands, which is what keeps the fixture on screen for the one paint
   * in between instead of flashing an empty bill.
   */
  const [live, setLive] = useState<readonly OrderLine[] | null>(null);
  const [printing, setPrinting] = useState(false);

  /** Which of the four confirm sheets is open, if any. */
  const [sheet, setSheet] = useState<OrderAction | null>(null);
  /** True while one of them is in flight. The sheet stays up and waits. */
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /**
   * The signature the last refusal raised, kept so the re-send can spend it.
   *
   * `BillActionController` raises the request itself when it refuses, so by the
   * time the console hears "a manager must sign", the row a manager signs
   * already exists. Sending the discount again *without* this id would raise a
   * second one — a queue filling with duplicates of the same question is how a
   * manager learns to approve without reading.
   */
  const [approvalId, setApprovalId] = useState<number | null>(null);

  useEffect(() => {
    if (orderId === null) return;

    const abort = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/orders?id=${orderId}`, { signal: abort.signal });

        if (!response.ok) return;

        const body = (await response.json()) as { data?: { items?: ApiLine[] } };
        const items = body.data?.items;

        if (items === undefined) return;

        setLive(
          items
            .filter((item) => item.status !== 'cancelled')
            .map((item): OrderLine => ({
              id: String(item.id),
              name: item.title,
              quantity: item.quantity,
              price: item.unit_price,
              state: LINE_STATE[item.status] ?? 'sent',
              // Free text a waiter typed, already in whatever language they
              // typed it in. Empty is absent, not an empty line.
              note: item.note ?? undefined,
            })),
        );
      } catch {
        // An abort or a dead API. The drawer keeps whatever it is showing —
        // closing it, or emptying it, would be worse than a stale bill.
      }
    })();

    return () => abort.abort();
  }, [orderId]);

  const lines = live ?? ORDER_LINES[order.id] ?? [];
  const reached = railIndex(order.status);

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  /*
   * The one place this screen does arithmetic, and it does it through the same
   * function the server uses. Service is dine-in only; VAT is inside the total
   * and is displayed, never added.
   */
  const totals = billTotals({
    subtotal,
    channel: order.channel === 'dine_in' ? 'dine_in' : 'delivery',
    // The restaurant's own rates rather than the package defaults, so the
    // figures match the labels printed beside them and the receipt the guest
    // is handed.
    servicePercent: rates.service,
    vatPercent: rates.vat,
  });

  /*
   * Formatted here rather than on the server, unlike the table's own column.
   *
   * The rows are settled before the page renders and the locale lives on the
   * server, so shipping a formatter to draw them would be a cost with no
   * return. These are not: the lines arrive after a click, and a drawer that
   * had to ask the server to format them would show a bill in two steps.
   */
  const amount = (tiyin: number) => formatTiyinAmount(tiyin, lang);

  const LINE_TONE: Record<string, string> = {
    sent: 'text-fg-subtle',
    cooking: 'text-warning-700',
    ready: 'text-success-700',
    served: 'text-fg-muted',
  };

  const ACTIONS = ['print', 'void', 'refund', 'discount', 'transfer'] as const;

  /**
   * The guest's receipt again, marked as a copy.
   *
   * `POST /kitchen/receipts` takes the order id, because a POS bill and an
   * order are the same row — so this works from the back office without the
   * console knowing anything about a till. It answers 202: the paper is
   * queued, and whether it came out is the print agent's news.
   *
   * A fixture row has no id to reprint, and says so rather than pretending.
   */
  async function reprint() {
    if (orderId === null) {
      flash.problem(`${order.id} · ${labels.action_print}`);

      return;
    }

    setPrinting(true);

    const answer = await post<unknown>('/api/orders', { action: 'print', orderId }, lang);

    setPrinting(false);

    if (answer.ok) {
      flash(`${order.id} · ${labels.reprinted}`);

      return;
    }

    // The API's own sentence, in the reader's language, when it sent one —
    // "no printer for this branch" is worth more than a generic failure.
    flash.problem(answer.message ?? `${order.id} · ${labels.action_print}`);
  }

  /**
   * The other four, once somebody has typed why.
   *
   * One function for all of them because they differ only in the body: the
   * route handler decides which module answers — Orders for the void, the
   * discount and the transfer, Finance for the refund, after it has found the
   * payment behind this order — and the drawer only has to say what should
   * happen to which order.
   *
   * **Every success closes the drawer and refreshes the page.** The table is
   * server-rendered, so a void that left the row on screen would leave a
   * cancelled order sitting in "Faol", and a discount changes a total this
   * drawer does not compute — it adds its lines up itself, because the guest's
   * arithmetic must not be a second opinion. Re-reading the page is the only
   * answer that cannot disagree with the server.
   */
  async function run(payload: ActionPayload) {
    // A fixture row has nothing to write about. The buttons refuse before this,
    // and this is the belt: `post()` would otherwise send `orderId: null`.
    if (orderId === null || busy) return;

    setBusy(true);
    setRefusal(null);

    const answer = await post<unknown>(
      '/api/orders',
      {
        ...payload,
        orderId,
        // Only ever carried by a discount, and only after one was raised.
        ...(payload.action === 'discount' && approvalId !== null ? { approvalId } : {}),
      },
      lang,
    );

    setBusy(false);

    if (answer.ok) {
      setSheet(null);
      onClose();
      flash(`${order.id} · ${labels[`done_${payload.action}`]}`);
      router.refresh();

      return;
    }

    /*
     * Two codes this screen has words for and the API does not: they are
     * decided by the route handler, which is the only place that has seen both
     * the order and its payments. See ../../api/orders/route.ts.
     */
    const OURS: Readonly<Record<string, string>> = {
      'refund.nothing_captured': labels.refundNothing,
      'refund.several_payments': labels.refundSeveral,
    };

    const raised = answer.meta?.approval_id;

    if (typeof raised === 'number') setApprovalId(raised);

    /*
     * The catalogue's sentence, then Orders' own words for the rule.
     *
     * `order.refused` is one code for a family — a closed bill, an already
     * split one, a discount larger than the food — so its sentence is
     * deliberately general and is the only half that comes in the reader's
     * language. `detail` is the specific half and is written wherever
     * `BillRegistry` threw it. Both, in that order: the reader is told what
     * happened in their language and then which rule, rather than being handed
     * a general apology or a sentence they may not read.
     */
    const detail = typeof answer.meta?.detail === 'string' ? answer.meta.detail : null;
    const said =
      OURS[answer.code] ?? answer.message ?? `${order.id} · ${labels[`action_${payload.action}`]}`;

    setRefusal({
      message: detail === null ? said : `${said} — ${detail}`,
      /*
       * A refusal this sheet can do something about.
       *
       * Only the discount's, and only once a request exists to sign. The
       * button then re-sends the identical body with the id on it — which is
       * a poll of the one thing that matters, rather than of
       * `GET /pos/approvals/{id}`: `Approvals::spend()` is what decides, and
       * it can still refuse an approval the queue already shows as approved
       * (spent, expired, or signed by the person who asked). A screen that
       * watched the queue and then wrote would have two answers and would show
       * the wrong one.
       */
      retry:
        answer.code === 'order.approval_required' &&
        (typeof raised === 'number' || approvalId !== null),
    });
  }

  /** Open one of the four, from a clean slate. */
  function ask(action: OrderAction) {
    if (orderId === null) {
      flash.problem(`${order.id} · ${labels[`action_${action}`]}`);

      return;
    }

    setRefusal(null);
    // A signature is raised for one action at one amount and `spend()` checks
    // both, so carrying one into a different sheet could only ever be refused.
    setApprovalId(null);
    setSheet(action);
  }

  return (
    // A fragment, so the sheet is a sibling of the drawer rather than a child
    // of its backdrop: nested inside, a click on the sheet's own backdrop would
    // bubble to this one and take the drawer down with it.
    <>
      <div
        className="fixed inset-0 z-[200] flex justify-end"
        style={{ background: 'rgba(15,19,32,.4)' }}
        onClick={onClose}
        role="presentation"
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={order.id}
          onClick={(event) => event.stopPropagation()}
          data-scroll
          className="bg-surface-raised flex h-full w-[440px] max-w-full flex-col overflow-y-auto border-l p-6"
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-xl font-semibold tracking-tight">{order.where}</h3>
              <p data-num className="text-fg-subtle mt-1 text-sm">
                {order.id} · {labels[`detail_${order.id}`]} · {order.time}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="text-fg-muted hover:bg-bg-muted grid size-8 flex-none place-items-center rounded-md"
            >
              ✕
            </button>
          </header>

          {/* ------------------------------------------------------ the rail */}
          <ol className="border-divider mt-5 flex border-t pt-5">
            {ORDER_RAIL.map((step, index) => (
              <li key={step} className="min-w-0 flex-1">
                <span
                  aria-hidden
                  className={`block h-1 rounded-full ${
                    index <= reached ? 'bg-brand-500' : 'bg-border'
                  } ${index === 0 ? '' : 'ml-0.5'}`}
                />
                <span
                  className={`mt-1.5 block truncate text-[11px] ${
                    index <= reached ? 'font-semibold' : 'text-fg-subtle'
                  }`}
                >
                  {labels[`rail_${step}`]}
                </span>
              </li>
            ))}
          </ol>

          <p className="text-fg-subtle mt-4 text-xs">
            {labels.waiter}: <span className="text-fg font-medium">{order.waiter}</span>
          </p>

          {/* ----------------------------------------------------- the lines */}
          {lines.length === 0 ? (
            <p className="text-fg-subtle mt-5 text-sm leading-normal">{labels.noLines}</p>
          ) : (
            <ul className="border-divider mt-5 border-t pt-3">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="border-divider flex gap-3 border-b py-2.5 last:border-0"
                >
                  <span data-num className="text-fg-subtle w-6 flex-none text-sm font-semibold">
                    {line.quantity}×
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{line.name}</span>
                    {line.note === undefined ? null : (
                      <span className="text-fg-subtle block text-xs">{line.note}</span>
                    )}
                    {/* Per line, not per table: a guest asking why the tea has
                      not come is asking about one line. */}
                    <span className={`block text-xs font-semibold ${LINE_TONE[line.state]}`}>
                      {labels[`line_${line.state}`]}
                    </span>
                  </span>

                  <span data-num className="flex-none text-sm font-semibold">
                    {amount(line.price * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ---------------------------------------------------- the totals */}
          <dl className="border-divider mt-4 border-t pt-3 text-sm">
            <Row label={labels.subtotal} value={amount(totals.subtotal)} />

            {totals.serviceCharge > 0 ? (
              <Row label={labels.service} value={amount(totals.serviceCharge)} />
            ) : null}

            <div className="border-divider mt-2 flex items-baseline justify-between border-t pt-2.5">
              <dt className="font-semibold">{labels.total}</dt>
              <dd data-num className="font-display text-xl font-bold">
                {amount(totals.total)}
              </dd>
            </div>
          </dl>

          {/* Inside the total, never added to it — DECISIONS Q1. */}
          <p data-num className="text-fg-subtle mt-1.5 text-xs">
            {labels.vat.replace('{amount}', amount(totals.vatIncluded))}
          </p>

          <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-5 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
            {labels.actionsNote}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                data-press
                disabled={busy || (action === 'print' && printing)}
                /*
                 * All five write. Print goes straight out — a copy of a receipt
                 * asks nobody anything — and the other four open a confirm sheet
                 * first, because each of them needs something this drawer cannot
                 * infer:
                 *
                 * **Void** and **refund** need the sentence that makes them
                 * readable months later. `POST /orders/orders/{id}/cancel` and
                 * `POST /finance/payments/{payment}/refund` both demand one, and
                 * the second is not even addressed by order — the route handler
                 * finds the payment behind this bill first, and refuses rather
                 * than guessing when there is more than one.
                 *
                 * **Discount** and **transfer** used to have nowhere to go: at a
                 * till they are `POST /pos/bills/{id}/discount` and `/transfer`,
                 * behind `RequireTerminalSession`, which refuses a console token
                 * on purpose — those are acts by a named person at a named
                 * terminal. `BillActionController` is the Orders-side door for
                 * the same two operations, through the same `BillRegistry`, on
                 * `orders.manage` rather than `pos.sell`, and with P9's signature
                 * rule still applying: over the reader's ceiling the discount
                 * comes back 403 with a request in a manager's queue, and this
                 * screen says so instead of pretending it worked.
                 */
                onClick={() => (action === 'print' ? void reprint() : ask(action))}
                className={`h-11 rounded-md border text-sm font-semibold disabled:opacity-60 ${
                  action === 'print' ? 'col-span-2' : ''
                } ${action === 'void' || action === 'refund' ? 'text-danger-600' : ''}`}
              >
                {labels[`action_${action}`]}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Keyed on the action, so opening a different sheet starts from a blank
          form. Not keyed on anything that changes during a retry: the whole
          point of the re-send is that it carries the same body. */}
      {sheet === null ? null : (
        <OrderActionSheet
          key={sheet}
          action={sheet}
          labels={labels}
          tables={tables}
          waiters={waiters}
          busy={busy}
          refusal={refusal}
          onClose={() => setSheet(null)}
          onConfirm={(payload) => void run(payload)}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd data-num className="font-medium">
        {value}
      </dd>
    </div>
  );
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
