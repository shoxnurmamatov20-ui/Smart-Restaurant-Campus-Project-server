/**
 * The cashier's till dashboard.
 *
 * One drawer, one shift. The figures are the drawer's, not the branch's: a
 * cashier is accountable for what is in front of them and for nothing else,
 * and a variance is only meaningful against a single drawer.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type PaymentMethodId = 'cash' | 'card' | 'wallet';

export type Payment = {
  id: string;
  time: string;
  /** The order this settled. */
  order: string;
  method: PaymentMethodId;
  amount: number;
  /** A refund is a payment with the sign reversed, not a separate kind. */
  refund?: boolean;
};

export type CashierOverview = {
  greetingName: string;
  /** What should be in the drawer right now, in tiyin. */
  drawer: number;
  openingFloat: number;
  payments: number;
  refunds: number;
  tablesAwaiting: number;
  recent: readonly Payment[];
  methods: readonly { id: PaymentMethodId; amount: number }[];
};

const PLACEHOLDER: CashierOverview = {
  greetingName: 'Dilshod',
  drawer: som(2_184_000),
  openingFloat: som(500_000),
  payments: 64,
  refunds: 1,
  tablesAwaiting: 3,

  recent: [
    { id: 'p-1', time: '13:42', order: 'A-1286', method: 'card', amount: som(74_000) },
    { id: 'p-2', time: '13:31', order: 'A-1284', method: 'cash', amount: som(186_000) },
    { id: 'p-3', time: '13:18', order: 'A-1281', method: 'wallet', amount: som(212_000) },
    { id: 'p-4', time: '13:04', order: 'A-1279', method: 'card', amount: som(96_000) },
    {
      id: 'p-5',
      time: '12:51',
      order: 'A-1276',
      method: 'cash',
      amount: som(42_000),
      refund: true,
    },
    { id: 'p-6', time: '12:38', order: 'A-1274', method: 'card', amount: som(348_000) },
  ],

  methods: [
    { id: 'card', amount: som(1_284_000) },
    { id: 'cash', amount: som(842_000) },
    { id: 'wallet', amount: som(318_000) },
  ],
};

/** TODO(api): GET /api/v1/finance/till/current — the signed-in cashier's drawer. */
export async function getCashierOverview(): Promise<CashierOverview> {
  return PLACEHOLDER;
}
