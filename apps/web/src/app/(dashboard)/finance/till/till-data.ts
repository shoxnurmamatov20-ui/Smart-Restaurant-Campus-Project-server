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
  /**
   * Tonight's takings by tender, for the caption under the sales card.
   *
   * Empty on the fixture console. It is carried rather than recomputed for the
   * same reason every other figure here is: the shift document is the one
   * arithmetic a cashier is counted against, and a split derived beside it is a
   * split that can disagree with it.
   */
  byMethod: readonly { method: string; amount: number }[];
  /** How many receipts were reversed — the caption under the refunds card. */
  refundedReceipts: number;
  /**
   * The shift's own receipts, for the tab of that name.
   *
   * `null` when this render is the fixture console, which is what lets the tab
   * keep drawing `RECEIPTS` there and nothing else anywhere: a cashier reading
   * "reprint A-1291" on a live till was being shown another restaurant's paper.
   */
  receiptRows: readonly ReceiptRow[] | null;
  /**
   * Whose tips this shift owes, from `GET /finance/shifts/{id}/tips`.
   *
   * Null on the fixture console, where the design's four waiters stand; a
   * live shift with nobody tipped yet is an empty list, which the tab draws
   * as "no tips yet" rather than as four people who do not work here.
   */
  tipRows: readonly LiveTipRow[] | null;
  /** How many of them have not been declared yet — the tab's own caption. */
  pendingFiscal: number;
};

/** One waiter's tips for the open shift — the API's own split, in tiyin. */
export type LiveTipRow = {
  id: string;
  waiter: string | null;
  cash: number;
  card: number;
  covers: number;
  total: number;
};

// ============ Closing the day (P10) ============

/**
 * The X-report and the Z-report, which are one document read at two moments.
 *
 * The API sends the whole thing in one shape — `GET /finance/shifts/{id}/report`
 * — and the four sections come in the order a cashier reads them: what we sold,
 * how it was paid, therefore what should be in the box, and the reasons the box
 * is not exactly that. The order is the argument, so this file keeps it.
 *
 * A closed Z is frozen server-side and never recomputed. Nothing here should
 * derive a figure the document already carries: refund one of yesterday's bills
 * this afternoon and any figure this screen worked out for itself would move,
 * with nothing to say it had.
 */
export type ShiftIdentity = {
  id: number;
  number: string;
  /** `open` while it sells, `counting` once locked, `closed` once signed. */
  status: 'open' | 'counting' | 'closed';
  opened_at: string | null;
  /**
   * Who opened it, by name — `ShiftReporter::identity()`.
   *
   * Optional because the demo document below has no user behind it, and
   * nullable because a shift opened by an automation has no person either. The
   * header used to name one cashier from the message catalogue on every
   * restaurant's till.
   */
  opened_by?: string | null;
  locked_at: string | null;
  closed_at: string | null;
};

export type ShiftTurnover = {
  takings: number;
  refunded: number;
  /** Bills, not payments: a table paying with two cards is one bill. */
  bills: number;
  payments: number;
  average_bill: number;
};

export type ShiftMethod = {
  /** `cash`, `card`, `payme`, `click` — a code, not copy. */
  method: string;
  payments: number;
  amount: number;
  tips: number;
  /** The acquirer's cut, which never touches tonight's notes. */
  fees: number;
  net: number;
};

export type ShiftDrawer = {
  opening_cash: number;
  cash_taken: number;
  cash_rounding: number;
  cash_tips: number;
  cash_brought_in: number;
  cash_paid_out: number;
  expected_cash: number;
  /** Null until somebody has counted; a variance needs two numbers. */
  counted_cash: number | null;
  difference: number | null;
  difference_reason: string | null;
};

export type ShiftAdjustments = {
  rounding: number;
  tips: { total: number; cash: number; non_cash: number };
  fees: number;
  refunds: { count: number; amount: number };
  payouts: { cash: number; non_cash: number };
  brought_in: { cash: number };
};

/**
 * What tonight's gap demands, answered before the drawer is counted.
 *
 * The point of asking early: a cashier who learns at eight o'clock that this
 * evening will need the manager can fetch them while they are still on the
 * floor, rather than at midnight with the notes counted and the manager gone.
 */
export type ShiftVariance = {
  difference: number;
  is_clean: boolean;
  shortfall: number;
  surplus: number;
  needs_reason: boolean;
  needs_approval: boolean;
  notifies_owner: boolean;
  thresholds: { reason: number; approval: number; owner: number };
};

export type ShiftSignatures = {
  counted_by: string | null;
  witnessed_by: string | null;
  approved_by: string | null;
};

export type ShiftDocument = {
  shift: ShiftIdentity;
  turnover: ShiftTurnover;
  methods: readonly ShiftMethod[];
  drawer: ShiftDrawer;
  adjustments: ShiftAdjustments;
  variance: ShiftVariance;
  signatures: ShiftSignatures;
  /** False when this is the demo document rather than the server's. */
  live: boolean;
};

/**
 * The demo Z.
 *
 * Built from the same fixtures the movement list uses, so the two halves of the
 * fixture screen agree: the expected figure under the table is the expected
 * figure in the report beside it. A demo where those two disagree teaches the
 * reader to distrust the one screen whose whole job is agreement.
 *
 * A function rather than a constant because the timestamps are relative — a
 * fixture with a fixed opening time reads as a shift that started in August
 * whatever month it is.
 */
export function shiftDocumentFixture(): ShiftDocument {
  const expected = expectedInDrawer();
  const cashTaken = MOVES.filter((move) => move.into && move.label !== 'mFloat').reduce(
    (total, move) => total + move.amount,
    0,
  );
  const paidOut = MOVES.filter((move) => !move.into).reduce(
    (total, move) => total + move.amount,
    0,
  );
  const opened = new Date();
  opened.setHours(9, 0, 0, 0);

  return {
    shift: {
      id: 0,
      number: 'Z-0001',
      status: 'open',
      opened_at: opened.toISOString(),
      locked_at: null,
      closed_at: null,
    },
    turnover: {
      takings: SHIFT.salesTiyin,
      refunded: SHIFT.refundsTiyin,
      bills: SHIFT.receipts,
      payments: SHIFT.receipts,
      average_bill: Math.round(SHIFT.salesTiyin / SHIFT.receipts),
    },
    methods: [
      {
        method: 'cash',
        payments: 26,
        amount: som(4_820_000),
        tips: 0,
        fees: 0,
        net: som(4_820_000),
      },
      {
        method: 'card',
        payments: 21,
        amount: som(4_820_000),
        tips: som(120_000),
        fees: som(96_400),
        net: som(4_723_600),
      },
    ],
    drawer: {
      opening_cash: som(500_000),
      cash_taken: cashTaken,
      cash_rounding: 0,
      cash_tips: 0,
      cash_brought_in: 0,
      cash_paid_out: paidOut,
      expected_cash: expected,
      counted_cash: null,
      difference: null,
      difference_reason: null,
    },
    adjustments: {
      rounding: 0,
      tips: { total: som(120_000), cash: 0, non_cash: som(120_000) },
      fees: som(96_400),
      refunds: { count: 2, amount: SHIFT.refundsTiyin },
      payouts: { cash: paidOut, non_cash: 0 },
      brought_in: { cash: 0 },
    },
    variance: {
      difference: 0,
      is_clean: true,
      shortfall: 0,
      surplus: 0,
      needs_reason: false,
      needs_approval: false,
      notifies_owner: false,
      // The plan's rungs: a reason at 5 000, a manager at 20 000, the owner at
      // 50 000 so'm. Shown so the demo screen can explain itself.
      thresholds: { reason: som(5_000), approval: som(20_000), owner: som(50_000) },
    },
    signatures: { counted_by: null, witnessed_by: null, approved_by: null },
    live: false,
  };
}

/* ============================================================
   Receipts and tips — the two tabs the till never had

   `specs/01-os.md §5.16` gives the till three tabs and the module shipped one.
   The two missing ones are the two a cashier is actually interrupted for:
   "reprint that receipt" and "how much of my tips came on a card".
   ============================================================ */

export type ReceiptRow = {
  id: string;
  /** The bill it settled. */
  order: string;
  at: string;
  /** `cash`, `card`, `payme`, `click` — a code, not copy. */
  method: string;
  /** Tiyin. Negative when it is a refund. */
  amount: number;
  /** Who took it. */
  cashier: string;
  /** Fiscal sign, when the receipt has been declared. */
  fiscalSign: string | null;
  voided?: boolean;
};

export const RECEIPTS: readonly ReceiptRow[] = [
  {
    id: 'r1',
    order: 'A-1291',
    at: '13:42',
    method: 'card',
    amount: som(74_000),
    cashier: 'Dilshod K.',
    fiscalSign: 'FP 4417 2298',
  },
  {
    id: 'r2',
    order: 'A-1290',
    at: '13:31',
    method: 'cash',
    amount: som(186_000),
    cashier: 'Dilshod K.',
    fiscalSign: 'FP 4417 2297',
  },
  {
    id: 'r3',
    order: 'A-1288',
    at: '13:18',
    method: 'payme',
    amount: som(212_000),
    cashier: 'Dilshod K.',
    fiscalSign: 'FP 4417 2296',
  },
  {
    id: 'r4',
    order: 'A-1284',
    at: '12:54',
    method: 'cash',
    amount: -som(42_000),
    cashier: 'Dilshod K.',
    fiscalSign: 'FP 4417 2294',
  },
  /* Not yet declared. The queue is what P11 exists for, and the column shows
     it rather than leaving the cell blank. */
  {
    id: 'r5',
    order: 'A-1283',
    at: '12:40',
    method: 'card',
    amount: som(96_000),
    cashier: 'Dilshod K.',
    fiscalSign: null,
  },
  {
    id: 'r6',
    order: 'A-1279',
    at: '12:12',
    method: 'cash',
    amount: som(58_000),
    cashier: 'Malika T.',
    fiscalSign: 'FP 4417 2291',
    voided: true,
  },
];

export const pendingFiscal = (): number => RECEIPTS.filter((row) => row.fiscalSign === null).length;

/**
 * Tips by waiter, split by how they arrived.
 *
 * The split is the whole point of the tab. Cash tips are in a pocket already;
 * card tips are money the restaurant is holding on somebody's behalf and has to
 * pay out — and payroll needs the number. A single "tips" figure hides which is
 * which and the payout is wrong every month.
 */
export type TipRow = {
  id: string;
  waiter: string;
  /** Tiyin. */
  cash: number;
  card: number;
  /** Covers served, for the per-cover figure a manager compares people on. */
  covers: number;
};

export const TIPS: readonly TipRow[] = [
  { id: 'jasur', waiter: 'Jasur Toshev', cash: som(184_000), card: som(226_000), covers: 41 },
  { id: 'nodira', waiter: 'Nodira Saidova', cash: som(142_000), card: som(198_000), covers: 36 },
  { id: 'malika', waiter: 'Malika Rahimova', cash: som(96_000), card: som(154_000), covers: 28 },
  { id: 'aziz', waiter: "Aziz Yo'ldoshev", cash: som(68_000), card: som(88_000), covers: 19 },
];

export const tipTotal = (row: { cash: number; card: number }): number => row.cash + row.card;

/** What the restaurant owes out — the card half, which it is holding. */
export const cardTipsOwed = (): number => TIPS.reduce((sum, row) => sum + row.card, 0);

export const perCover = (row: { cash: number; card: number; covers: number }): number =>
  row.covers === 0 ? 0 : Math.round(tipTotal(row) / row.covers);
