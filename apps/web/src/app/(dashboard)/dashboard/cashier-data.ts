import { scaleFor, type Period } from './overview-data';

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
  /** The venue this drawer is in, from the session. */
  placeName: string;
  /** False for the design's own till — see `./figures.ts`. */
  live: boolean;
  /**
   * What should be in the drawer right now, in tiyin, or `null` when no till is
   * open.
   *
   * Null is a real answer and not an absence: `RoleDashboards::currentShift()`
   * says so by sending `shift: null`. This is the one number on the platform
   * where an invented value can produce a real accusation of theft, so a
   * cashier who has opened nothing reads a dash and the button that opens one.
   */
  drawer: number | null;
  openingFloat: number | null;
  payments: number | null;
  refunds: number | null;
  /** Tables that have asked for the bill — `tables_awaiting` on the payload. */
  tablesAwaiting: number | null;
  recent: readonly Payment[];
  methods: readonly { id: PaymentMethodId; amount: number }[];
};

const PLACEHOLDER = {
  greetingName: 'Dilshod',
  placeName: 'Chilonzor',
  live: false,
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
} satisfies CashierOverview;

/**
 * The fixture this screen falls back to. Live seam: `getCashierLive()` in
 * `./dashboard-server.ts`, which takes the drawer from the open shift on
 * `GET /api/v1/dashboard?role=cashier`.
 */
export async function getCashierOverview(period: Period = 'today'): Promise<CashierOverview> {
  /*
   * The drawer is *not* scaled. It is what is physically in front of the
   * cashier now; a week of takings is a different question and multiplying the
   * drawer by six would put a number on screen that no count could ever match.
   */
  const factor = scaleFor(period);

  if (factor !== 1) {
    return {
      ...PLACEHOLDER,
      payments: Math.round(PLACEHOLDER.payments * factor),
      refunds: Math.round(PLACEHOLDER.refunds * factor),
      methods: PLACEHOLDER.methods.map((method) => ({
        ...method,
        amount: Math.round(method.amount * factor),
      })),
    };
  }

  return PLACEHOLDER;
}
