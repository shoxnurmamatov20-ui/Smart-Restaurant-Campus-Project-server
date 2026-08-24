import { apiGet, type Paginated } from '@/lib/api-server';

import {
  expectedInDrawer,
  MOVES,
  pendingFiscal,
  SHIFT,
  shiftDocumentFixture,
  type ReceiptRow,
  type ShiftDocument,
  type TillMove,
  type TillState,
} from './till-data';

/**
 * The till, from the API.
 *
 * Server half of ./till-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 */

/**
 * `GET /finance/shifts` — read for one thing only, the id to ask the report for.
 *
 * Deliberately not the money columns. `CashShiftResource` carries
 * `expected_cash`, `counted_cash` and `difference`, and all three are stored
 * fields the API writes at close: on an open shift they read zero. The document
 * recomputes them, so it is the only place this screen takes a figure from.
 */
type ApiShift = { id: number };

type ApiPayment = {
  id: number;
  order_number: string;
  method: string;
  amount: number;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
};

/**
 * One declared document — `GET /finance/fiscal/receipts`.
 *
 * Read for two things a payment cannot answer: whether the fiscal module has
 * signed it, and the ROW ID a NUSXA copy is asked for by. `fiscal_receipt_no`
 * on the payment is the number printed on the paper, not a key.
 */
type ApiFiscalReceipt = {
  id: number;
  order_number: string | null;
  kind: string;
  fiscal_sign: string | null;
};

/**
 * `GET /finance/expenses` — and `category` is load-bearing here.
 *
 * Every way money leaves a drawer arrives in this one table, and the category
 * is the only thing that tells them apart: `EloquentTillLedger::recordCashOut()`
 * stamps `other` on a collection and `refund` on a reversed bill. So a shift's
 * cash-paid `other` rows are the drops, and the two must not be added together
 * — a refunded bill is money going back to a guest, not money going to a safe.
 */
type ApiExpense = {
  cash_shift_id: number | null;
  category: string;
  description: string;
  amount: number;
  paid_in_cash: boolean;
  spent_at: string | null;
};

/** `09:00` from an ISO timestamp, which is all the design's column shows. */
const clock = (iso: string | null): string => (iso === null ? '—' : iso.slice(11, 16));

/**
 * The category the ledger stamps on money taken out of a drawer.
 *
 * Not a residual bucket, whatever the word suggests: `recordCashOut()` writes
 * it for every collection and every POS cash-out, so on a shift it means "left
 * the drawer for the safe". An expense typed on the books screen carries its
 * own category and is not paid in cash, so it cannot land here.
 */
const DRAWER_OUT = 'other';

/**
 * The till for this render.
 *
 * Only cash moves the drawer. A card payment is takings and appears in the
 * sales figure, but it never passes through the till, so listing it among the
 * movements would make the expected figure disagree with the drawer by exactly
 * the card total — which is the bug this screen exists to make visible.
 *
 * The shift's own document is passed in rather than fetched again: `page.tsx`
 * already asks for it, both halves of this screen have to agree figure for
 * figure, and two reads of a live drawer taken a moment apart are two chances
 * for them not to.
 *
 * **Every figure comes off the document, not off `CashShiftResource`.** That
 * resource's `expected_cash` is a stored column written once, at close — it is
 * `0` for the whole of an open shift, which is the state this screen is nearly
 * always in. The report recomputes it (`CashShift::computeExpectedCash()`), and
 * that is the number the cashier will be counted against.
 *
 * Both lists are asked for by shift. Unfiltered they answer the restaurant's
 * whole history a page at a time, so the drawer would show yesterday's takings
 * and last week's payouts as though they were in the box tonight.
 */
/** One row of `GET /api/v1/finance/shifts/{shift}/tips`. */
type ApiTipRow = {
  waiter_user_id: number | null;
  waiter: string | null;
  cash: number;
  card: number;
  covers: number;
  total: number;
};

export async function getTill(
  t: (key: string) => string,
  report: Promise<ShiftDocument | null>,
): Promise<TillState> {
  const shiftDocument = await report;

  const fixture = (): TillState => ({
    moves: MOVES.map((move) => ({ ...move, label: t(move.label) })),
    sales: SHIFT.salesTiyin,
    receipts: SHIFT.receipts,
    refunds: SHIFT.refundsTiyin,
    dropped: SHIFT.droppedTiyin,
    expected: expectedInDrawer(),
    byMethod: [],
    refundedReceipts: 0,
    // Null, not `RECEIPTS`: the tab draws the demo paper only where the whole
    // screen is the demo, and the page decides that from this being null.
    receiptRows: null,
    tipRows: null,
    pendingFiscal: pendingFiscal(),
  });

  /*
   * A restaurant that has never opened a shift gets zeroes, not a demo drawer.
   *
   * `null` here is the API saying "there is no shift", which is a different
   * fact from "there is no session" — and it used to produce the same screen:
   * Z-0001 open since 09:00 with takings, 26 cash payments and an expected
   * drawer figure, on the screen a cashier is counted against. The page draws
   * its own "no shift open" state and never renders these figures, but they
   * have to be honest anyway.
   */
  if (shiftDocument === null) {
    return {
      moves: [],
      sales: 0,
      receipts: 0,
      refunds: 0,
      dropped: 0,
      expected: 0,
      byMethod: [],
      refundedReceipts: 0,
      receiptRows: [],
      tipRows: [],
      pendingFiscal: 0,
    };
  }

  if (!shiftDocument.live) return fixture();

  const shift = shiftDocument.shift.id;

  const [payments, expenses, fiscal, tips] = await Promise.all([
    apiGet<Paginated<ApiPayment>>(`/finance/payments?per_page=200&filter[shift]=${shift}`),
    apiGet<Paginated<ApiExpense>>(`/finance/expenses?per_page=100&filter[shift]=${shift}`),
    /*
     * The evening's declared documents, for the receipts tab.
     *
     * A second read rather than a field on the payment, because the two answer
     * different questions: a payment says money arrived, a fiscal receipt says
     * the state has been told about it — and the NUSXA button needs the fiscal
     * row's id, which `fiscal_receipt_no` is not.
     *
     * `summary.pending` rides along and is the tab's own caption. Counting the
     * signless rows on this page would answer for one page of a busy shift.
     */
    apiGet<Paginated<ApiFiscalReceipt> & { summary?: { pending?: number } }>(
      `/finance/fiscal/receipts?per_page=200&filter[shift]=${shift}`,
    ),
    // Whose tips the till owes — the join Finance cannot make itself,
    // made for it upstream through the Orders contract.
    apiGet<{ data: ApiTipRow[] }>(`/finance/shifts/${shift}/tips`),
  ]);

  if (!payments?.data) return fixture();

  const cash = payments.data.filter((payment) => payment.method === 'cash');
  const paidInCash = (expenses?.data ?? []).filter((expense) => expense.paid_in_cash);

  const moves: TillMove[] = [
    // The float, which is where every drawer starts.
    {
      time: clock(shiftDocument.shift.opened_at),
      label: t('mFloat'),
      amount: shiftDocument.drawer.opening_cash,
      into: true,
    },
    ...cash.map((payment) => ({
      time: clock(payment.paid_at),
      label: payment.order_number,
      amount: payment.amount,
      into: true,
    })),
    ...paidInCash.map((expense) => ({
      time: clock(expense.spent_at),
      label: expense.description,
      amount: expense.amount,
      into: false,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return {
    moves,
    sales: shiftDocument.turnover.takings,
    // Payments, not rows: `data.length` is one page of them, so a busy shift
    // reported exactly `per_page` receipts and stopped counting.
    receipts: shiftDocument.turnover.payments,
    refunds: shiftDocument.turnover.refunded,
    /*
     * What went to the safe, which is narrower than what left the drawer.
     *
     * `drawer.cash_paid_out` is every cash-paid expense on the shift — drops,
     * refunds handed back over the counter, a delivery paid from the till — and
     * showing that under "Inkassatsiya" would credit the safe with money a
     * guest walked out with. The category is what separates them.
     */
    dropped: paidInCash
      .filter((expense) => expense.category === DRAWER_OUT)
      .reduce((total, expense) => total + expense.amount, 0),
    expected: shiftDocument.drawer.expected_cash,
    /*
     * The tender split and the refund count, for the captions under the cards.
     *
     * Those three sub-lines were catalogue literals — "naqd 4 820 000 · karta
     * 4 820 000" under a live sales figure — so a cashier reconciling their own
     * drawer read another restaurant's split. Both come off the document the
     * card above them came from, which is the only way the two can agree.
     */
    byMethod: shiftDocument.methods.map((row) => ({ method: row.method, amount: row.amount })),
    refundedReceipts: shiftDocument.adjustments.refunds.count,
    receiptRows: receiptsFrom(payments.data, fiscal?.data),
    tipRows: (tips?.data ?? []).map((row, index) => ({
      id: row.waiter_user_id === null ? `unassigned-${index}` : String(row.waiter_user_id),
      waiter: row.waiter,
      cash: row.cash,
      card: row.card,
      covers: row.covers,
      total: row.total,
    })),
    pendingFiscal: fiscal?.summary?.pending ?? 0,
  };
}

/**
 * The shift's receipts, one row per payment.
 *
 * Per PAYMENT rather than per fiscal document, and the difference is the point
 * of the tab: the column headings are time, order, tender and amount, and only
 * a payment knows the tender. The fiscal side contributes exactly two things —
 * whether it has been signed, and the id a NUSXA copy is asked for by.
 *
 * Matched on the order number, which is what both tables carry. A payment with
 * no fiscal row is not an error: the declaration window is twenty-four hours
 * and the queue drains, which is what the "queued" chip in the column says.
 */
export function receiptsFrom(
  payments: readonly ApiPayment[],
  fiscal: readonly ApiFiscalReceipt[] | undefined,
): readonly ReceiptRow[] {
  /*
   * Sales only. A `refund` document is the reversal of a sale that already has
   * a row here, and listing both would show the evening's takings twice — once
   * forwards and once backwards — under two identical order numbers.
   */
  const signed = new Map(
    (fiscal ?? [])
      .filter((receipt) => receipt.kind !== 'refund' && receipt.order_number !== null)
      .map((receipt) => [receipt.order_number as string, receipt]),
  );

  return payments
    .map((payment): ReceiptRow => {
      const receipt = signed.get(payment.order_number);

      return {
        /*
         * The fiscal row's id where there is one, so the NUSXA button can ask
         * for a copy. Where there is none it is deliberately not a number:
         * `apiId()` answers null for it, and the tab draws no button rather
         * than one that would flash "reprinted" over a document the state has
         * never heard of.
         */
        id: receipt === undefined ? `p${payment.id}` : String(receipt.id),
        order: payment.order_number,
        at: clock(payment.paid_at),
        method: payment.method,
        amount: payment.amount,
        // Not drawn by the table, and there is no per-payment cashier column on
        // the API — a shift has one drawer and whoever opened it.
        cashier: '',
        fiscalSign: receipt?.fiscal_sign ?? null,
        /*
         * Struck through rather than negated. The receipt's face value is what
         * was printed on it, and drawing a reversed 74 000 as −74 000 beside an
         * unreversed one would make the column stop adding up to the takings
         * above it — which the strike-through says without touching the figure.
         */
        ...(payment.refunded_at === null ? {} : { voided: true }),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * The shift's own document — the X while it is open, the signed Z once it is not.
 *
 * One endpoint for both, which is the API's choice and the right one: they are
 * the same page read at two moments, and two endpoints would be two chances for
 * them to disagree. This module does not recompute a single figure of it. The
 * closed document is frozen server-side precisely so that refunding one of
 * yesterday's bills this afternoon cannot quietly restate yesterday's Z, and a
 * client deriving its own totals would undo that.
 *
 * `counted` asks the same question hypothetically: "and if the drawer held this
 * much?". Nothing is written and nothing is decided — the same policy that will
 * judge the close answers now, so the count screen can say "this needs the
 * manager" while the manager is still on the floor.
 */
export async function getShiftReport(counted?: number): Promise<ShiftDocument | null> {
  const shifts = await apiGet<Paginated<ApiShift>>('/finance/shifts?per_page=1');

  // No answer at all — no session, or a reader without `finance.view` — is the
  // fixture console. An ANSWER with no rows in it is a restaurant that has
  // never opened a till, and the two used to be one branch: the demo Z was
  // drawn for both, so a new venue was shown a shift, its takings, its payment
  // counts and an expected drawer figure, every one of them invented.
  if (!shifts?.data) return shiftDocumentFixture();

  const shift = shifts.data[0];

  if (!shift) return null;

  const query = counted === undefined ? '' : `?counted_cash=${counted}`;
  const report = await apiGet<{ data?: Omit<ShiftDocument, 'live'> }>(
    `/finance/shifts/${shift.id}/report${query}`,
  );

  // A shift the API knows about but a report it would not answer for — most
  // often a reader without `finance.view`. The demo document is the honest
  // fallback: it is visibly a demo, where a half-filled real one would not be.
  if (!report?.data?.shift) return shiftDocumentFixture();

  return { ...report.data, live: true };
}
