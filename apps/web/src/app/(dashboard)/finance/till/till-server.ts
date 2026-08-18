import { apiGet, type Paginated } from '@/lib/api-server';

import { expectedInDrawer, MOVES, SHIFT, type TillMove, type TillState } from './till-data';

/**
 * The till, from the API.
 *
 * Server half of ./till-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 */

type ApiShift = {
  id: number;
  number: string;
  opening_cash: number;
  expected_cash: number;
  opened_at: string | null;
  total_takings: number;
  is_open: boolean;
};

type ApiPayment = {
  order_number: string;
  method: string;
  amount: number;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
};

type ApiExpense = {
  description: string;
  amount: number;
  paid_in_cash: boolean;
  spent_at: string | null;
};

/** `09:00` from an ISO timestamp, which is all the design's column shows. */
const clock = (iso: string | null): string => (iso === null ? '—' : iso.slice(11, 16));

/**
 * The till for this render.
 *
 * Only cash moves the drawer. A card payment is takings and appears in the
 * sales figure, but it never passes through the till, so listing it among the
 * movements would make the expected figure disagree with the drawer by exactly
 * the card total — which is the bug this screen exists to make visible.
 */
export async function getTill(t: (key: string) => string): Promise<TillState> {
  const [shifts, payments, expenses] = await Promise.all([
    apiGet<Paginated<ApiShift>>('/finance/shifts?per_page=1'),
    apiGet<Paginated<ApiPayment>>('/finance/payments?per_page=200'),
    apiGet<Paginated<ApiExpense>>('/finance/expenses?per_page=100'),
  ]);

  const shift = shifts?.data?.[0];

  if (!shift || !payments?.data) {
    return {
      moves: MOVES.map((move) => ({ ...move, label: t(move.label) })),
      sales: SHIFT.salesTiyin,
      receipts: SHIFT.receipts,
      refunds: SHIFT.refundsTiyin,
      dropped: SHIFT.droppedTiyin,
      expected: expectedInDrawer(),
    };
  }

  const cash = payments.data.filter((payment) => payment.method === 'cash');
  const refunds = payments.data.filter((payment) => payment.status === 'refunded');
  const paidInCash = (expenses?.data ?? []).filter((expense) => expense.paid_in_cash);

  const moves: TillMove[] = [
    // The float, which is where every drawer starts.
    { time: clock(shift.opened_at), label: t('mFloat'), amount: shift.opening_cash, into: true },
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
    sales: shift.total_takings,
    receipts: payments.data.length,
    refunds: refunds.reduce((total, payment) => total + payment.amount, 0),
    // TODO(api): cash drops are `pos.drawer` movements in the Pos module, not
    // Finance. Joining the two is the till screen's next step; zero is the
    // honest answer until then, and it is also the true one on a shift where
    // nobody has dropped.
    dropped: 0,
    expected: shift.expected_cash,
  };
}
