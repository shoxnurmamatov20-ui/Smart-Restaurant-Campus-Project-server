import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
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

import { documentHref, langOf, printLink } from '@/app/(documents)/documents/documents-copy';
import { fetchCashLadder } from '@/lib/pos-session';

import { Tabs } from '../../tabs';
import { CashDrop, ReprintReceipt } from './till-actions';
import { cardTipsOwed, perCover, RECEIPTS, TIPS, tipTotal } from './till-data';
import { TillReports } from './till-reports';
import { getShiftReport, getTill } from './till-server';

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
 * The expected figure is recomputed from the ledger for every render rather
 * than read off the shift row, which is `till-server.ts`'s doing and is the
 * point: the number a cashier is counted against has to be one the ledger can
 * reproduce line by line, or a variance is an argument rather than a finding.
 * The stored column is written once, at close, so on an open shift it is zero.
 *
 * All three actions are real. The X report opens the shift document the API
 * already answers with; the Z runs the design's flow — count the notes, *then*
 * see the expected figure and the variance, then confirm — against
 * `POST /finance/shifts/{id}/close`; and the drop writes through
 * `POST /finance/shifts/{id}/collection`, which is the same ledger call the POS
 * drawer makes and lands in the movement list below within the same render.
 */
export default async function TillPage() {
  const [nav, t, common, pin, act, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.till'),
    getTranslations('console.common'),
    getTranslations('console.approvalPin'),
    getTranslations('console.actions'),
    getLocale(),
  ]);

  const lang = langOf(locale);

  /*
   * The API when there is a session, the fixtures when there is not.
   *
   * The document is handed to `getTill` as a promise rather than awaited first:
   * both halves of this screen have to show the same drawer, and awaiting it up
   * front would cost a round trip to say so.
   */
  const shiftDocument = getShiftReport();
  const [till, report, ladder] = await Promise.all([
    getTill(t, shiftDocument),
    shiftDocument,
    fetchCashLadder(),
  ]);
  const expected = till.expected;

  /*
   * The evening's paper, or the demo's.
   *
   * `receiptRows` is null exactly where the whole screen is the fixture — see
   * `getTill()` — so the tab draws `RECEIPTS` there and the restaurant's own
   * receipts everywhere else. It used to draw `RECEIPTS` on both, which meant a
   * cashier on a live till was offered "reprint A-1291" for a bill that belongs
   * to the design.
   */
  const receiptRows = till.receiptRows ?? RECEIPTS;

  /*
   * A restaurant with no shift is told so, rather than shown one.
   *
   * `getShiftReport()` answers `null` when the API replied and the venue has
   * never opened a till. That used to be the same branch as "no session", so a
   * brand-new restaurant read shift Z-0001 open since 09:00, with takings, 26
   * cash payments, an expected drawer figure and a movement list — every one
   * of them invented, on the screen a cashier is counted against.
   */
  if (report === null) {
    return (
      <>
        <PageHead title={nav('till')} lede={t('subtitle')} />

        <div className="bg-surface rounded-lg border px-7 py-10 text-center">
          <p className="text-md font-semibold">{t('noShift')}</p>
          <p className="text-fg-subtle mt-1.5 text-sm">{t('noShiftBody')}</p>
        </div>
      </>
    );
  }

  /*
   * The state chip and the line beside it, from the shift itself.
   *
   * Both were catalogue constants: a green "open" chip whatever the shift was
   * doing, and "opened at 09:00 by Dilshod Karimov" on every restaurant's till.
   * `opened_by` is the name `ShiftReporter::identity()` now resolves; a shift
   * with nobody behind it says only the time.
   */
  const openedClock = report.shift.opened_at?.slice(11, 16) ?? '—';
  const openedBy = report.shift.opened_by ?? null;

  const stateLabel =
    report.shift.status === 'closed'
      ? t('stateClosed')
      : report.shift.status === 'counting'
        ? t('stateCounting')
        : t('stateOpen');

  const openedLine = report.live
    ? openedBy === null
      ? t('openedAtLive', { time: openedClock })
      : t('openedByLive', { time: openedClock, who: openedBy })
    : t('openedAt');

  /* The three captions under the KPI cards, off the same document the figures
     came from. See `till-server.ts` for why they cannot be recomputed here. */
  const tender = (method: string): number =>
    till.byMethod.find((row) => row.method === method)?.amount ?? 0;

  const salesSub = report.live
    ? t('kSalesSubLive', {
        cash: formatTiyinAmount(tender('cash')),
        card: formatTiyinAmount(tender('card')),
      })
    : t('kSalesSub');

  const checksSub = report.live
    ? till.receipts === 0
      ? ''
      : t('kChecksSubLive', {
          amount: formatTiyinAmount(Math.round(till.sales / till.receipts)),
        })
    : t('kChecksSub');

  const refundsSub = report.live
    ? t('kRefundsSubLive', { n: till.refundedReceipts })
    : t('kRefundsSub');

  return (
    <>
      <PageHead title={nav('till')} lede={t('subtitle')} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusChip tone={report.shift.status === 'closed' ? 'neutral' : 'success'} dot>
          {stateLabel}
        </StatusChip>
        <span className="text-fg-subtle text-xs">{openedLine}</span>

        <span className="ml-auto flex items-center gap-2.5">
          <StatusChip tone="success" dot>
            {t('fiscal')}
          </StatusChip>
          <span className="text-fg-subtle text-xs">{t('fiscalOk')}</span>
        </span>
      </div>

      <Tabs
        ariaLabel={nav('till')}
        tabs={[
          { key: 'shift', label: t('tabShift') },
          { key: 'receipts', label: t('tabReceipts') },
          { key: 'tips', label: t('tabTips') },
        ]}
        panels={{
          shift: (
            <>
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
                  unit={salesSub}
                  attainment={null}
                />
                <KpiCard
                  label={t('kChecks')}
                  value={formatNumber(till.receipts)}
                  unit={checksSub}
                  attainment={null}
                />
                <KpiCard
                  label={t('kRefunds')}
                  value={formatTiyinAmount(till.refunds)}
                  unit={refundsSub}
                  attainment={null}
                />
                <KpiCard
                  label={t('kDrops')}
                  value={formatTiyinAmount(till.dropped)}
                  unit={t('kDropsSub')}
                  attainment={null}
                />
              </KpiRow>

              <div
                data-split
                className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5"
              >
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
                            className={
                              move.into ? 'font-semibold' : 'text-danger-700 font-semibold'
                            }
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

                    {/*
                     * A drop is a movement, so it lands in the log above and the
                     * expected figure falls with it. Every one is audited: a
                     * drawer is where a restaurant loses money quietly.
                     */}
                    <CashDrop
                      shiftId={report.shift.id}
                      live={report.live}
                      labels={{
                        open: t('drop'),
                        amount: t('amount'),
                        reason: t('reason'),
                        confirm: t('confirm'),
                        cancel: t('cancel'),
                        asked: act('cashDrop'),
                      }}
                    />
                  </Panel>

                  <Panel>
                    <PanelHead title={t('xReport')} subtitle={t('xSub')} />

                    <TillReports
                      report={report}
                      ladder={ladder}
                      labels={{
                        xReport: t('xReport'),
                        zReport: t('zReport'),
                        close: common('close'),
                        cancel: common('cancel'),
                        openedAt: t('openedAt'),
                        takings: t('takings'),
                        bills: t('bills'),
                        averageBill: t('averageBill'),
                        refunded: t('refunded'),
                        byMethod: t('byMethod'),
                        afterFees: t.raw('afterFees') as string,
                        method_cash: t('methodCash'),
                        method_card: t('methodCard'),
                        method_payme: 'Payme',
                        method_click: 'Click',
                        drawer: t('drawer'),
                        openingFloat: t('openingFloat'),
                        cashTaken: t('cashTaken'),
                        paidOut: t('paidOut'),
                        expected: t('expected'),
                        xNote: t('xNote'),
                        countSub: t('countSub'),
                        note: t('note'),
                        pieces: t('pieces'),
                        sum: t('sum'),
                        counted: t('counted'),
                        next: t('next'),
                        variance: t('variance'),
                        matched: t('matched'),
                        shortReason: t('shortReason'),
                        overReason: t('overReason'),
                        needsApproval: t.raw('varianceNeedsApproval') as string,
                        countAgain: t('countAgain'),
                        closeShift: t('closeShift'),
                        closeFailed: t('closeFailed'),
                        pinReason: t.raw('pinReason') as string,
                        pinTitle: pin('title'),
                        pinSub: pin('sub'),
                        digitsEntered: pin.raw('digits') as string,
                      }}
                    />

                    {/*
                     * The paper the Z becomes. `TillReports` above closes the
                     * shift on screen; this opens the printable Z-hisobot from
                     * `(documents)`, at 80 mm, ready for the roll. Deep-linked
                     * with `?d=z` so a cashier lands on the document rather
                     * than on a switcher.
                     */}
                    <Link
                      href={documentHref('z')}
                      data-press
                      className="border-border-strong hover:bg-bg-muted mt-3 grid h-11 w-full place-items-center rounded-md border text-sm font-semibold"
                    >
                      {printLink('z', lang)}
                    </Link>
                  </Panel>
                </div>
              </div>
            </>
          ),
          receipts: (
            <>
              <p className="text-fg-muted mb-3 text-sm leading-normal">
                {t('receiptsSub', { pending: till.pendingFiscal })}
              </p>

              <DataTable minWidth={760}>
                <DataHead>
                  <tr>
                    <DataTh>{t('rcColTime')}</DataTh>
                    <DataTh>{t('rcColOrder')}</DataTh>
                    <DataTh>{t('rcColMethod')}</DataTh>
                    <DataTh align="right">{t('rcColAmount')}</DataTh>
                    <DataTh>{t('rcColFiscal')}</DataTh>
                    {/* No heading: the column is one button, and "Actions"
                        over a single verb is a word for nothing. */}
                    <DataTh align="right"> </DataTh>
                  </tr>
                </DataHead>
                <tbody>
                  {receiptRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-fg-subtle px-5 py-8 text-center text-sm">
                        {t('receiptsEmpty')}
                      </td>
                    </tr>
                  ) : null}
                  {receiptRows.map((row) => (
                    <DataTr key={row.id}>
                      <DataTd numeric className="text-fg-muted">
                        {row.at}
                      </DataTd>
                      <DataTd
                        numeric
                        className={row.voided ? 'text-fg-subtle line-through' : 'font-medium'}
                      >
                        {row.order}
                      </DataTd>
                      {/*
                       * Payme and Click are brand names and read the same in
                       * all three languages, so they are not in the catalogue —
                       * `i18n.test.ts` rejects entries identical across
                       * locales, and it is right to.
                       */}
                      {/*
                       * A tender the catalogue has a word for, or the tender's
                       * own name. The till writes `uzcard` and `humo` as well as
                       * `card`, and the old ladder folded every one of them it
                       * did not recognise into "Click" — so a Humo sale on a
                       * live drawer was labelled as a wallet the restaurant may
                       * not even accept.
                       */}
                      <DataTd className="text-fg-muted">
                        {row.method === 'cash'
                          ? t('methodCash')
                          : row.method === 'card'
                            ? t('methodCard')
                            : row.method.charAt(0).toUpperCase() + row.method.slice(1)}
                      </DataTd>
                      <DataTd
                        align="right"
                        numeric
                        className={
                          row.amount < 0 ? 'text-danger-700 font-semibold' : 'font-semibold'
                        }
                      >
                        {row.amount < 0 ? '−' : ''}
                        {formatTiyinAmount(Math.abs(row.amount))}
                      </DataTd>

                      {/*
                       * A receipt with no fiscal sign is not an error and must
                       * not read as one: the declaration window is 24 hours and
                       * the queue drains. It says "queued", because a blank
                       * cell reads as data that failed to load.
                       */}
                      <DataTd numeric className="text-fg-muted">
                        {row.fiscalSign ?? (
                          <StatusChip tone="warning">{t('fiscalQueued')}</StatusChip>
                        )}
                      </DataTd>

                      <DataTd align="right">
                        {/*
                         * `POST /finance/fiscal/receipts/{id}/duplicate` stamps
                         * NUSXA and counts the copy. Nothing is filed again —
                         * a duplicate is paper, not a second declaration.
                         *
                         * No button where there is nothing to copy. A payment
                         * still in the declaration queue has no document, and a
                         * button that flashed "reprinted" over one would be
                         * claiming a piece of paper exists.
                         */}
                        {row.fiscalSign === null && till.receiptRows !== null ? null : (
                          <ReprintReceipt
                            id={row.id}
                            label={t('reprint')}
                            message={`${row.order} · ${act('reprinted')}`}
                          />
                        )}
                      </DataTd>
                    </DataTr>
                  ))}
                </tbody>
              </DataTable>
            </>
          ),
          tips: (
            <>
              {/*
               * The one tab on this screen with nothing behind it, and it says
               * so rather than drawing four waiters.
               *
               * A tip is on `finance.payments` as a column and the waiter is on
               * the ORDER, in another module — Finance may not read Orders, so
               * splitting tips by person needs `App\Contracts\Orders\
               * BillRegistry` to answer who served which bill. Until it does,
               * the design's four names with their cash and card halves are
               * another restaurant's payout list, on the screen somebody uses
               * to hand money over at the end of a shift.
               */}
              <p className="text-fg-muted mb-3 text-sm leading-normal">
                {t('tipsSub', {
                  amount: formatTiyinAmount(
                    till.tipRows === null
                      ? cardTipsOwed()
                      : till.tipRows.reduce((sum, row) => sum + row.card, 0),
                  ),
                })}
              </p>

              <DataTable minWidth={640}>
                <DataHead>
                  <tr>
                    <DataTh>{t('tipColWaiter')}</DataTh>
                    <DataTh align="right">{t('tipColCash')}</DataTh>
                    <DataTh align="right">{t('tipColCard')}</DataTh>
                    <DataTh align="right">{t('tipColCovers')}</DataTh>
                    <DataTh align="right">{t('tipColPerCover')}</DataTh>
                    <DataTh align="right">{t('tipColTotal')}</DataTh>
                  </tr>
                </DataHead>
                <tbody>
                  {(till.tipRows ?? TIPS).map((row) => (
                    <DataTr key={row.id}>
                      <DataTd className="font-medium">{row.waiter ?? t('tipNoWaiter')}</DataTd>
                      <DataTd align="right" numeric className="text-fg-muted">
                        {formatTiyinAmount(row.cash)}
                      </DataTd>

                      {/* The half the restaurant is holding and has to pay out. */}
                      <DataTd align="right" numeric className="text-brand-700 font-semibold">
                        {formatTiyinAmount(row.card)}
                      </DataTd>

                      <DataTd align="right" numeric className="text-fg-muted">
                        {row.covers}
                      </DataTd>
                      <DataTd align="right" numeric className="text-fg-muted">
                        {formatTiyinAmount(perCover(row))}
                      </DataTd>
                      <DataTd align="right" numeric className="font-semibold">
                        {formatTiyinAmount(tipTotal(row))}
                      </DataTd>
                    </DataTr>
                  ))}
                  {till.tipRows !== null && till.tipRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-fg-subtle px-5 py-8 text-center text-sm">
                        {t('tipsEmpty')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </>
          ),
        }}
      />
    </>
  );
}
