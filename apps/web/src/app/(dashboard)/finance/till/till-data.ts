import type { Messages } from '@/i18n';

/**
 * The open till, as the design's screen shows it.
 *
 * Every figure is integer tiyin. This is the one screen where that matters
 * most: the variance at the bottom is `counted − expected`, and a float
 * anywhere in that chain is a cashier being asked to explain a rounding error.
 *
 * Wired to `/finance/shifts`, `/finance/payments` and `/finance/expenses` —
 * see `./till-server.ts`. Opening, dropping and closing are still POSTs the Finance
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

// ============ The API seam's shapes ============
// The seam itself — the requests and the mapping — lives in ./till-server.ts.

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
