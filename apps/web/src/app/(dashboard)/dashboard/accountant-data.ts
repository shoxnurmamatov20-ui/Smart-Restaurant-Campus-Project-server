/**
 * The accountant's finance dashboard.
 *
 * Same seam as ./overview-data.ts. The accountant reads all five branches and
 * never a single one — their scope is the business's money, so no figure below
 * is branch-filtered and `getAccountantOverview()` takes no branch.
 *
 * Money is integer tiyin. Percentages arrive already derived: net margin, and
 * budget attainment are computed server-side per the design's §5.4, because a
 * margin the client works out is a margin two clients can disagree about.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/** One month of the cash-flow chart. */
export type CashMonth = {
  /** `2026-03` — formatted for display at the edge, in the reader's locale. */
  id: string;
  /** Short month label. Three letters, already in the reader's language. */
  label: string;
  inflow: number;
  outflow: number;
};

export type PaymentMethod = {
  id: 'cash' | 'card' | 'wallet' | 'transfer';
  amount: number;
};

export type UpcomingPayment = {
  id: string;
  /** A supplier's name is a proper noun; it is not translated. */
  supplier: string;
  amount: number;
  /** Negative when the invoice is already past its due date. */
  daysUntilDue: number;
};

export type TaxLine = {
  id: 'vat' | 'income' | 'social';
  status: 'ready' | 'pending';
};

export type AccountantOverview = {
  greetingName: string;
  revenueMtd: number;
  expenses: number;
  expenseBudget: number;
  /** Net margin as a percentage, one decimal. Derived server-side. */
  netMargin: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  cashflow: readonly CashMonth[];
  methods: readonly PaymentMethod[];
  upcoming: readonly UpcomingPayment[];
  taxes: readonly TaxLine[];
};

const PLACEHOLDER: AccountantOverview = {
  greetingName: 'Malika',
  revenueMtd: som(438_600_000),
  expenses: som(121_400_000),
  expenseBudget: som(168_000_000),
  netMargin: 16.4,
  unpaidInvoices: 11,
  overdueInvoices: 4,

  cashflow: [
    { id: '2026-03', label: 'Mar', inflow: som(512_000_000), outflow: som(431_000_000) },
    { id: '2026-04', label: 'Apr', inflow: som(548_000_000), outflow: som(452_000_000) },
    { id: '2026-05', label: 'May', inflow: som(596_000_000), outflow: som(478_000_000) },
    { id: '2026-06', label: 'Iyn', inflow: som(624_000_000), outflow: som(501_000_000) },
    { id: '2026-07', label: 'Iyl', inflow: som(671_000_000), outflow: som(524_000_000) },
    { id: '2026-08', label: 'Avg', inflow: som(438_600_000), outflow: som(366_800_000) },
  ],

  methods: [
    { id: 'card', amount: som(214_900_000) },
    { id: 'cash', amount: som(142_500_000) },
    { id: 'wallet', amount: som(61_400_000) },
    { id: 'transfer', amount: som(19_800_000) },
  ],

  upcoming: [
    { id: 'inv-4471', supplier: 'Anhor Meat', amount: som(38_400_000), daysUntilDue: -6 },
    { id: 'inv-4468', supplier: 'Toshkent Non', amount: som(9_200_000), daysUntilDue: -2 },
    { id: 'inv-4482', supplier: 'Fresh Line', amount: som(14_700_000), daysUntilDue: 2 },
    { id: 'inv-4485', supplier: 'Coca-Cola Ichimlik', amount: som(22_100_000), daysUntilDue: 5 },
  ],

  taxes: [
    { id: 'vat', status: 'ready' },
    { id: 'income', status: 'pending' },
    { id: 'social', status: 'ready' },
  ],
};

/** TODO(api): GET /api/v1/finance/overview?period=mtd — no branch scope. */
export async function getAccountantOverview(): Promise<AccountantOverview> {
  return PLACEHOLDER;
}
