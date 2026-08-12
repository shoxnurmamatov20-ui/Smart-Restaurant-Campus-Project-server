import type { Messages } from '@/i18n';

/**
 * The closed month, as the design's Finance screen reads it.
 *
 * Money is integer tiyin throughout, including the negative lines: an outflow
 * is a negative amount rather than a positive one with a flag, so the P&L adds
 * up by summation and the net profit cannot disagree with its own rows.
 *
 * TODO(api): GET /api/v1/finance/period?month= — the closed period. Nothing
 * here should be computed in the browser: a P&L that two clients round
 * differently is a P&L nobody trusts.
 */

type Finance = Messages['console']['finance'];

export type LedgerLine = {
  key: keyof Pick<
    Finance,
    'plFood' | 'plBeverages' | 'plCogs' | 'plPayroll' | 'plRent' | 'plMarketing' | 'plOther'
  >;
  /** Tiyin. Negative for an outflow. */
  amount: number;
  /** Share of revenue, signed the same way as the amount. */
  ofRevenue: number;
  /** Against the previous month. */
  delta: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const LEDGER: readonly LedgerLine[] = [
  { key: 'plFood', amount: som(412_600_000), ofRevenue: 78.4, delta: 9.1 },
  { key: 'plBeverages', amount: som(113_800_000), ofRevenue: 21.6, delta: 12.7 },
  { key: 'plCogs', amount: som(-196_400_000), ofRevenue: -37.3, delta: 4.2 },
  { key: 'plPayroll', amount: som(-94_200_000), ofRevenue: -17.9, delta: 2.0 },
  { key: 'plRent', amount: som(-41_000_000), ofRevenue: -7.8, delta: 0 },
  { key: 'plMarketing', amount: som(-12_800_000), ofRevenue: -2.4, delta: -14.0 },
  { key: 'plOther', amount: som(-18_600_000), ofRevenue: -3.5, delta: 6.5 },
];

export type PaymentSlice = {
  /** A message key, or a payment brand — those are proper nouns. */
  key: 'payCard' | 'payCash' | null;
  brand?: string;
  amount: number;
  percent: number;
};

export const PAYMENT_MIX: readonly PaymentSlice[] = [
  { key: 'payCard', amount: som(231_400_000), percent: 44 },
  { key: 'payCash', amount: som(152_200_000), percent: 29 },
  { key: null, brand: 'Click', amount: som(84_200_000), percent: 16 },
  { key: null, brand: 'Payme', amount: som(58_600_000), percent: 11 },
];

/** Six months of money in and money out, in millions of so'm. */
export const CASHFLOW: readonly { month: string; in: number; out: number }[] = [
  { month: 'Mar', in: 74, out: 58 },
  { month: 'Apr', in: 81, out: 61 },
  { month: 'May', in: 88, out: 64 },
  { month: 'Iyn', in: 79, out: 66 },
  { month: 'Iyl', in: 94, out: 68 },
  { month: 'Avg', in: 62, out: 44 },
];

export const PERIOD = {
  revenueTiyin: som(526_400_000),
  expensesTiyin: som(363_000_000),
  netProfitTiyin: som(163_400_000),
  cashOnHandTiyin: som(88_100_000),
  netMargin: '31.0%',
  netDelta: '+11.4%',
  refundsTiyin: som(4_210_000),
  discountsTiyin: som(18_640_000),
  vatTiyin: som(56_400_000),
  unreconciled: 2,
} as const;

/**
 * Which way a change should be read.
 *
 * Spending 14% less on marketing is good news; earning 14% less is not. So the
 * colour follows the line's own sign rather than the delta's — which is the
 * one piece of logic on this screen that a reader would otherwise have to do
 * in their head, every row.
 */
export function deltaTone(line: LedgerLine): string {
  if (line.delta === 0) return 'text-fg-subtle';

  const good = line.amount < 0 ? line.delta < 0 : line.delta > 0;

  return good ? 'text-success-700' : 'text-danger-700';
}
