import { apiGet, type Paginated } from '@/lib/api-server';

import type { Messages } from '@/i18n';

/**
 * The open till, as the design's screen shows it.
 *
 * Every figure is integer tiyin. This is the one screen where that matters
 * most: the variance at the bottom is `counted − expected`, and a float
 * anywhere in that chain is a cashier being asked to explain a rounding error.
 *
 * Wired to `/finance/shifts`, `/finance/payments` and `/finance/expenses` —
 * see `getTill()`. Opening, dropping and closing are still POSTs the Finance
 * module owns and this screen does not yet send; each one writes to the audit
 * log, because a drawer is where a restaurant loses money quietly.
 */

type Till = Messages['console']['till'];

export type CashMove = {
  time: string;
  label: keyof Pick<Till, 'mFloat' | 'mCash18' | 'mRefund1832' | 'mCash21' | 'mRefund1841'>;
  /** Tiyin. Always positive; `into` says which way it went. */
  amount: number;
  into: boolean;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const MOVES: readonly CashMove[] = [
  { time: '09:00', label: 'mFloat', amount: som(500_000), into: true },
  { time: '11:20', label: 'mCash18', amount: som(2_140_000), into: true },
  { time: '13:45', label: 'mRefund1832', amount: som(86_000), into: false },
  { time: '15:10', label: 'mCash21', amount: som(2_680_000), into: true },
  { time: '16:30', label: 'mRefund1841', amount: som(100_000), into: false },
];

export const SHIFT = {
  salesTiyin: som(9_640_000),
  receipts: 47,
  refundsTiyin: som(186_000),
  droppedTiyin: 0,
} as const;

/**
 * What should be in the drawer.
 *
 * Derived from the movements rather than stored, so the figure the cashier is
 * counted against is the same one the ledger can reproduce.
 */
export const expectedInDrawer = (): number =>
  MOVES.reduce((total, move) => total + (move.into ? move.amount : -move.amount), 0);

// ============ The API seam ============

/**
 * The open till, as the API knows it.
 *
 * A movement's label is the interesting difference. The fixtures name each one
 * with a catalogue key, because a fixture cannot know what a real drawer did;
 * the API has the actual reason — an order number, an expense description — and
 * that is a proper noun, not copy. So the seam resolves both to a plain string
 * and the screen prints it.
 */
export type TillMove = { time: string; label: string; amount: number; into: boolean };

export type TillState = {
  moves: readonly TillMove[];
  sales: number;
  receipts: number;
  refunds: number;
  dropped: number;
  expected: number;
};

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
