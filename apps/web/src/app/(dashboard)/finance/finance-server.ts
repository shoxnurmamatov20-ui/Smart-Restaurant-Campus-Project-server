import { apiGet } from '@/lib/api-server';

import type { Lang } from '@/lib/console-post';

import {
  CASHFLOW,
  LEDGER,
  PAYMENT_MIX,
  PERIOD,
  type LedgerLine,
  type PaymentSlice,
} from './finance-data';

/**
 * The closed month, read from the server.
 *
 * Server half of `./finance-data.ts`, split per the house rule: types and
 * fixtures in `*-data.ts`, anything that calls the API in a sibling only server
 * components import.
 *
 * ---------------------------------------------------------------------------
 * Why this file could not exist until now
 *
 * The screen is a CALENDAR MONTH and the only period the analytics module knew
 * was `?period=today|week|month`, where `month` meant the trailing thirty
 * trading days ending today — never "July". Three of the seven ledger lines were
 * missing even for the windows that did exist: expenses arrived as one total
 * with no split, labour arrived as a percentage and only after `analytics:rollup`
 * had run, and the two revenue lines had nothing to be derived from.
 *
 * `GET /analytics/profit-loss?month=YYYY-MM` answers all of it now, including
 * the previous month's revenue for the comparison column, so this file is a
 * mapping rather than arithmetic. The one thing it still computes is
 * `ofRevenue`, which is a ratio of two figures the payload already carries.
 *
 * ---------------------------------------------------------------------------
 * Paths carry no `/v1`
 *
 * `apiBase()` already ends `.../api/v1`. A path written as `/v1/analytics/...`
 * asks for `/api/v1/v1/...`, gets a 404, and `apiGet` answers `null` — which
 * every screen renders as its fixture, silently. That failure has shipped on
 * this codebase before; see the note in `settings-server.ts`.
 */

/** One heading of `expenses`, as the statement groups them. */
type ApiExpenseLine = { category: string; amount_tiyin: number; entries: number };

/** One menu category's takings for the month. */
type ApiCategoryLine = { slug: string; revenue_tiyin: number };

type ApiStatement = {
  data: {
    month: string;
    previous_month: string;
    vat_percent: number;
    revenue_by_category: ApiCategoryLine[];
    revenue: {
      gross_tiyin: number;
      net_tiyin: number;
      previous_net_tiyin: number;
      discounts_tiyin: number;
      delta_percent: number | null;
    };
    cost_of_sales: { tiyin: number; coverage_percent: number };
    labour: { tiyin: number; previous_tiyin: number };
    expenses: ApiExpenseLine[];
    expenses_total_tiyin: number;
    depreciation_tiyin: number;
    totals: { ebitda_tiyin: number; operating_profit_tiyin: number };
    source: { days: number; expected_days: number; computed_at: string | null };
  };
};

/**
 * The KPI figures, widened.
 *
 * `PERIOD` in the fixture is `as const`, so `typeof PERIOD` types `netMargin` as
 * the literal `'31.0%'` — which is right for a fixture nobody computes and wrong
 * the moment a real month is measured. Declared here rather than loosened there:
 * the fixture's literals are what make it obvious in an editor that those two
 * strings are pre-formatted rather than numbers.
 */
export type PeriodFigures = {
  revenueTiyin: number;
  expensesTiyin: number;
  netProfitTiyin: number;
  /**
   * The drawers and the accounts as they stand now.
   *
   * Nullable because the cash book can refuse — a reader without
   * `finance.view` on it is the likeliest way — and the fixture's 88.1M so'm
   * sitting on an otherwise live strip is a cash balance from another
   * business. An em dash is the answer.
   */
  cashOnHandTiyin: number | null;
  netMargin: string;
  netDelta: string;
  /**
   * Refunds and shifts that failed their count — both `null` on the live path.
   *
   * Neither is on this statement. A refund reverses a payment and is already
   * inside the revenue figure with no total of its own; "unreconciled" counts
   * shifts whose drawer disagreed, which is a `finance/till` question this
   * screen does not ask. They used to fall back to the fixture, so a
   * restaurant that had never taken a payment reported 4 210 000 so'm of
   * refunds and two failed counts.
   */
  refundsTiyin: number | null;
  discountsTiyin: number;
  vatTiyin: number;
  unreconciled: number | null;
};

export type FinanceScreen = {
  ledger: readonly LedgerLine[];
  period: PeriodFigures;
  /** The month's takings by tender, or `null` when nothing was taken. */
  paymentMix: readonly PaymentSlice[] | null;
  /**
   * Six months of money in and out.
   *
   * It used to be `null` on every live render, and the reason was arithmetic
   * rather than judgement: six months meant six calls to `profit-loss`, so the
   * panel was hidden instead of drawn. `GET /analytics/cashflow?months=6`
   * answers the series in one, and this is CASH — what was taken and what was
   * spent — which deliberately disagrees with the statement above it. A month
   * can be profitable and short of money, and that is the thing the chart is
   * for.
   *
   * Still nullable: no session, or an API that did not answer, is the fixture,
   * and a live restaurant with six empty months is `null` too — six flat bars
   * are a chart with nothing in it.
   */
  cashflow: readonly CashflowBar[] | null;
  /**
   * Whether the outgoings on that chart are the whole business's.
   *
   * `finance.expenses` carries no `branch_id`, so a venue-scoped read narrows
   * the takings and not the spending. The screen prints a footnote rather than
   * quietly showing one branch a profit it does not have.
   */
  cashflowScoped: boolean;
  /** How many refunds made up `refundsTiyin`, for the caption under it. */
  refundCount: number | null;
  /** How many shifts were closed in the month the count is out of. */
  shiftsClosed: number | null;
  /** Which calendar month is drawn, `YYYY-MM`. */
  month: string;
  /** Whether that month has been closed in the ledger. `null` when unknown. */
  monthClosed: boolean | null;
  /** Whether what is drawn came from the server. The screen says so. */
  live: boolean;
  /**
   * How much of the month the projection covers, `12/31`.
   *
   * Published because a month with eleven days of facts is not a month, and a
   * reader looking at a statement has to be able to tell. `analytics:rollup
   * --from --to` backfills the rest.
   */
  coverage: { days: number; expectedDays: number } | null;
};

/**
 * One bar of the cash-flow chart.
 *
 * `label` is what is printed under it and `in`/`out` are integer tiyin. The
 * fixture's own shape carried millions of so'm because a bar only needs a
 * ratio; keeping tiyin here means the same figures can be totalled later
 * without a second unit in the file.
 */
export type CashflowBar = { month: string; label: string; in: number; out: number };

/**
 * Three-letter month names, written out rather than formatted.
 *
 * The same decision `books-server.ts` makes and for the same two reasons: ICU
 * writes Uzbek months in lower case while the design's labels are capitalised,
 * and which ICU a container shipped with would then decide what the chart says.
 * Twelve rows of three words is cheaper than a fidelity difference nobody can
 * reproduce from the source.
 */
const SHORT_MONTHS: Readonly<Record<Lang, readonly string[]>> = {
  uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/**
 * Which menu categories are drinks.
 *
 * By SLUG, because the API groups by slug for the reason a name cannot be
 * grouped by: it is jsonb in three languages. The list is here rather than on
 * the server because "which of my categories is the bar" is a property of a
 * restaurant's own menu, not of the platform — and the honest failure when a
 * restaurant names its drinks something else is the mild one: the takings land
 * under food, which is where an uncategorised split has to put them.
 */
const DRINK_SLUGS: ReadonlySet<string> = new Set([
  'ichimliklar',
  'drinks',
  'napitki',
  'bar',
  'kokteyllar',
]);

/**
 * The console's seven expense headings against the ledger's four lines.
 *
 * `payroll` is drawn from `labour` rather than from the expenses list, because
 * the two are different figures and only one of them is complete: `labour` is
 * hours worked × the rate on the record, projected nightly for every venue,
 * while a `payroll` expense row is a month's wages somebody typed in as one
 * payment and may not have. Adding them would count the same wages twice.
 */
const RENT: ReadonlySet<string> = new Set(['rent']);
const MARKETING: ReadonlySet<string> = new Set(['marketing']);

/**
 * The month to draw.
 *
 * The one that finished, not the one that is running: a P&L is read about a
 * closed month, and defaulting to the current one would answer a half-empty
 * sheet to a screen that asked no question. The server defaults the same way,
 * so this is belt and braces rather than the rule.
 */
function lastMonth(): string {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}

/**
 * Everything on this screen the restaurant actually earned and spent.
 *
 * Returns the fixture unchanged when there is no session or the API is down —
 * `apiGet` answers `null` for both — so the screen keeps working and keeps
 * showing the demo it was built against.
 */
export async function financeScreen(
  month = lastMonth(),
  lang: Lang = 'uz',
): Promise<FinanceScreen> {
  const today = new Date().toISOString().slice(0, 10);
  const from = monthStart(month);
  const to = monthEnd(month);

  const [statement, book, monthBook, periods, refunds, shifts, cashflow] = await Promise.all([
    apiGet<ApiStatement>(`/analytics/profit-loss?month=${encodeURIComponent(month)}`),
    /*
     * One day of the cash book, for one number: the closing balance.
     *
     * A day rather than the month, because "cash on hand" is about NOW — what
     * is in the drawers and the safe as this page renders — and the balance the
     * book carries down is the accounts' declared opening figure plus everything
     * that has happened since, so a one-day window answers it in full.
     */
    apiGet<{ closing_balance: number }>(`/finance/cash-book?from=${today}&to=${today}`),
    /*
     * The whole month, for the tender split.
     *
     * The donut used to be `PAYMENT_MIX` on the live path — 44% card, 29% cash,
     * Click, Payme, totalling 526M so'm — beside genuinely live P&L lines, on a
     * restaurant that had taken no payment at all. The cash book is the one read
     * that is both windowed and grouped by method, and it is what
     * `settings-server.ts` already uses for the same question.
     */
    apiGet<{ entries: ApiBookEntry[] }>(
      `/finance/cash-book?from=${monthStart(month)}&to=${monthEnd(month)}`,
    ),
    /*
     * Whether this month has been closed, for the one claim the header makes.
     *
     * The subtitle stated "closed and reconciled on 3 August" from the
     * catalogue — an accounting assertion, printed for a restaurant that has
     * closed nothing.
     */
    apiGet<{ data: ApiAccountingPeriod[] }>('/finance/periods?months=12'),
    /*
     * What was handed back this month, as one figure.
     *
     * `per_page=1` on purpose: the rows are not wanted, the window total is —
     * and it rides in the meta precisely so a screen does not have to page a
     * month of takings to add up the reversals. A refund lowers revenue and has
     * no total of its own on the statement, which is why this card drew an em
     * dash on every live render until the endpoint learned a date window.
     */
    apiGet<ApiPaymentWindow>(`/finance/payments?per_page=1&filter[from]=${from}&filter[to]=${to}`),
    /*
     * How many drawers disagreed with what the system expected.
     *
     * Unfiltered by `unreconciled` so the meta can also say how many were
     * closed at all: "2" means nothing without "out of 61", and the caption
     * under this card used to name a branch and a date from the catalogue.
     */
    apiGet<ApiShiftWindow>(`/finance/shifts?per_page=1&filter[from]=${from}&filter[to]=${to}`),
    /*
     * Six months of money in and out, in one call — see the `cashflow` field on
     * `FinanceScreen` for why this could not exist before.
     */
    apiGet<ApiCashflow>('/analytics/cashflow?months=6'),
  ]);

  const figures = statement?.data;

  if (figures === undefined) {
    return {
      ledger: LEDGER,
      period: PERIOD,
      paymentMix: PAYMENT_MIX,
      cashflow: CASHFLOW.map((bar) => ({ ...bar, label: bar.month })),
      cashflowScoped: false,
      refundCount: null,
      shiftsClosed: null,
      month,
      monthClosed: null,
      live: false,
      coverage: null,
    };
  }

  const revenue = figures.revenue.net_tiyin;

  /*
   * Every line's share of revenue, signed the way the line is.
   *
   * `deltaTone()` in `finance-data.ts` reads that sign to decide whether a fall
   * is good news — spending 14% less on marketing is, earning 14% less is not —
   * so an outflow written as a positive number would colour the whole column
   * backwards.
   */
  const share = (amount: number): number =>
    revenue === 0 ? 0 : Math.round((amount / revenue) * 1000) / 10;

  const spent = (match: ReadonlySet<string>): number =>
    figures.expenses
      .filter((line) => match.has(line.category))
      .reduce((total, line) => total + line.amount_tiyin, 0);

  const rent = spent(RENT);
  const marketing = spent(MARKETING);

  /*
   * Everything else that left the business, including depreciation.
   *
   * The design's seventh line is "Boshqa", and a statement whose named rows do
   * not add up to its own total is worse than one with a large "other". The
   * `payroll` heading is subtracted out for the reason above: those wages are
   * already in the `labour` line, and leaving them here would count a month's
   * staff cost twice.
   */
  const other =
    figures.expenses_total_tiyin -
    rent -
    marketing -
    spent(new Set(['payroll'])) +
    figures.depreciation_tiyin;

  const drinks = figures.revenue_by_category
    .filter((row) => DRINK_SLUGS.has(row.slug))
    .reduce((total, row) => total + row.revenue_tiyin, 0);

  const sold = figures.revenue_by_category.reduce((total, row) => total + row.revenue_tiyin, 0);

  /*
   * The revenue split is a PROPORTION of the projection's total, not the sum of
   * the bill lines.
   *
   * The two disagree by design — the split is read live off today's bills while
   * revenue comes from a projection that is at most a day old — and a screen
   * whose two revenue rows did not add up to its own revenue KPI would be the
   * first thing an owner noticed. So the proportion is what is taken across,
   * and the total stays the one every other figure on the page is derived from.
   */
  const beverages = sold === 0 ? 0 : Math.round((drinks / sold) * revenue);
  const food = revenue - beverages;

  const delta = figures.revenue.delta_percent ?? 0;

  const ledger: LedgerLine[] = [
    { key: 'plFood', amount: food, ofRevenue: share(food), delta },
    { key: 'plBeverages', amount: beverages, ofRevenue: share(beverages), delta },
    /*
     * The four outflows, and every `delta` on them is zero.
     *
     * The statement carries one comparison — revenue as a whole — because that
     * is the only previous-month figure it can prove. A per-line June column
     * would have to be invented, and the whole point of a comparison column is
     * that it is not. Zero is what `deltaTone()` reads as "no change to report"
     * and draws in the subtle grey; a fabricated percentage would draw in green.
     */
    {
      key: 'plCogs',
      amount: -figures.cost_of_sales.tiyin,
      ofRevenue: -share(figures.cost_of_sales.tiyin),
      delta: 0,
    },
    {
      key: 'plPayroll',
      amount: -figures.labour.tiyin,
      ofRevenue: -share(figures.labour.tiyin),
      delta: 0,
    },
    { key: 'plRent', amount: -rent, ofRevenue: -share(rent), delta: 0 },
    { key: 'plMarketing', amount: -marketing, ofRevenue: -share(marketing), delta: 0 },
    { key: 'plOther', amount: -other, ofRevenue: -share(other), delta: 0 },
  ];

  const profit = figures.totals.operating_profit_tiyin;

  return {
    ledger,
    period: {
      ...PERIOD,
      revenueTiyin: revenue,
      expensesTiyin:
        figures.cost_of_sales.tiyin +
        figures.labour.tiyin +
        figures.expenses_total_tiyin +
        figures.depreciation_tiyin,
      netProfitTiyin: profit,
      // The drawer and the accounts as they stand today, not as they stood when
      // the month closed — which is what "cash on hand" means to the person
      // reading it, and the only figure on this screen that is about now.
      cashOnHandTiyin: book?.closing_balance ?? null,
      netMargin: `${revenue === 0 ? '0.0' : ((profit / revenue) * 100).toFixed(1)}%`,
      netDelta: `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}%`,
      discountsTiyin: figures.revenue.discounts_tiyin,
      /*
       * VAT, the way the statement itself states its method: the menu price
       * includes it, so the tax is what the gross exceeds the net by. Derived
       * rather than read, because no endpoint answers a VAT figure and the
       * subtraction is exact in integer tiyin.
       */
      vatTiyin: figures.revenue.gross_tiyin - revenue,
      /*
       * Both are now read, and neither comes from this statement.
       *
       * A refund reverses a payment and lowers revenue, so it is inside the
       * figures above with no total of its own; "unreconciled" counts shifts
       * whose drawer disagreed with what was expected. Two different windows of
       * `finance.payments` and `finance.cash_shifts` answer them, and `null`
       * still means the read did not come back — an em dash rather than a zero,
       * because "no refunds this month" and "nobody answered" are different
       * facts and only one of them is good news.
       */
      refundsTiyin: refunds?.meta.refunded_tiyin ?? null,
      unreconciled: shifts?.meta.unreconciled_count ?? null,
    },
    paymentMix: mixFrom(monthBook?.entries),
    cashflow: cashflowFrom(cashflow?.data.series, lang),
    cashflowScoped: cashflow?.data.scope.out === 'business' && cashflow.data.scope.in === 'branch',
    refundCount: refunds?.meta.refunded_count ?? null,
    shiftsClosed: shifts?.meta.closed_count ?? null,
    month,
    monthClosed: closedState(periods?.data, month),
    live: true,
    coverage: { days: figures.source.days, expectedDays: figures.source.expected_days },
  };
}

/**
 * The chart's bars, or nothing to draw.
 *
 * `null` for a series that did not arrive AND for one where every month is
 * empty: six bars of zero height under six month names is a chart that says a
 * restaurant took nothing since March, which for a new tenant is true and
 * useless, and for a broken read is a lie. The panel is dropped in both cases.
 */
export function cashflowFrom(
  series: readonly ApiCashflowMonth[] | undefined,
  lang: Lang,
): readonly CashflowBar[] | null {
  if (series === undefined || series.length === 0) return null;

  const moved = series.some((bar) => bar.in_tiyin !== 0 || bar.out_tiyin !== 0);

  if (!moved) return null;

  return series.map((bar): CashflowBar => {
    // `YYYY-MM` → the month's own index. Written out rather than parsed into a
    // Date: a bare `new Date('2026-03')` is UTC midnight and lands in February
    // for every reader west of Greenwich.
    const index = Number(bar.month.slice(5, 7)) - 1;

    return {
      month: bar.month,
      label: SHORT_MONTHS[lang][index] ?? bar.month,
      in: bar.in_tiyin,
      out: bar.out_tiyin,
    };
  });
}

/** The window meta `GET /finance/payments` now carries. */
type ApiPaymentWindow = {
  meta: { captured_tiyin: number; refunded_tiyin: number; refunded_count: number };
};

/** The window meta `GET /finance/shifts` now carries. */
type ApiShiftWindow = {
  meta: { closed_count: number; unreconciled_count: number; difference_tiyin: number };
};

/** One bar of `GET /analytics/cashflow`. */
type ApiCashflowMonth = {
  month: string;
  in_tiyin: number;
  out_tiyin: number;
  net_tiyin: number;
};

type ApiCashflow = {
  data: {
    series: ApiCashflowMonth[];
    scope: { in: string; out: string };
  };
};

/** One line of `GET /finance/cash-book`. */
type ApiBookEntry = { source: string; method: string; amount: number };

/** One row of `GET /finance/periods`. */
type ApiAccountingPeriod = { period: string; status: string };

/** The two the catalogue has a word for; anything else prints its own name. */
const TENDER_KEY: Readonly<Record<string, PaymentSlice['key']>> = {
  cash: 'payCash',
  card: 'payCard',
};

/**
 * The month's takings by tender, biggest first.
 *
 * Payments only, and only inbound ones: the book also carries expenses and
 * transfers, and a "payment mix" that counted a cash drop to the bank would
 * describe the safe rather than the guests. `null` for a month that took
 * nothing — an empty donut is a panel the screen can drop, while a donut of
 * somebody else's percentages is a figure an owner repeats.
 */
export function mixFrom(
  entries: readonly ApiBookEntry[] | undefined,
): readonly PaymentSlice[] | null {
  if (entries === undefined) return null;

  const takings = new Map<string, number>();
  let total = 0;

  for (const entry of entries) {
    if (entry.source !== 'payment' || entry.amount <= 0) continue;

    takings.set(entry.method, (takings.get(entry.method) ?? 0) + entry.amount);
    total += entry.amount;
  }

  if (total === 0) return null;

  return [...takings]
    .sort((a, b) => b[1] - a[1])
    .map(([method, amount]): PaymentSlice => {
      const key = TENDER_KEY[method] ?? null;

      return {
        key,
        // A tender the catalogue has no word for is a brand — `Click`, `Payme` —
        // and a brand is a proper noun in all three languages.
        ...(key === null ? { brand: method.charAt(0).toUpperCase() + method.slice(1) } : {}),
        amount,
        percent: Math.round((amount / total) * 100),
      };
    });
}

/**
 * Whether the drawn month is closed in the ledger.
 *
 * `null` when the register did not answer or does not carry the month — which
 * is different from "open", and the header says so rather than asserting either.
 */
export function closedState(
  periods: readonly ApiAccountingPeriod[] | undefined,
  month: string,
): boolean | null {
  if (periods === undefined) return null;

  const row = periods.find((period) => period.period.slice(0, 7) === month);

  return row === undefined ? null : row.status === 'closed';
}

/** The first day of `YYYY-MM`. */
const monthStart = (month: string): string => `${month}-01`;

/**
 * The last day of `YYYY-MM`, from the calendar rather than from a table of 30s.
 *
 * Day 0 of the NEXT month is the last day of this one, which is also right for
 * February in a leap year — the one case a hard-coded ladder gets wrong once
 * every four years, on a financial statement.
 */
function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));

  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}
