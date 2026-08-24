import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { PageHead } from '../../screen';
import {
  ADVANCE_PAID,
  AGEING,
  bucketTotal,
  delta,
  EXPENSE_BUDGET,
  EXPENSES,
  expenseTotal,
  netPay,
  PAYROLL_FUND,
  PAYROLL_SHARE,
  PAYROLL_STAFF,
  RECONCILIATION,
  unpaidTotal,
  accumulated,
  bookValue,
  LEDGER_COPY,
  say,
  stillCharging,
  type Lang,
  categoryTotals,
  BOOKS_TABS,
} from './books-data';
import { booksScreen } from './books-server';
import { BooksTabs } from './books-tabs';

export const generateMetadata = () => moduleMetadata('books');

/**
 * The books.
 *
 * Five tabs — expenses, debts both ways, payroll, the period close with its
 * reconciliation, and the filings. This screen shipped with four labels and no
 * handler, so only expenses was reachable and `documents` did not exist at all.
 *
 * Overdue is the only row that gets red. A payable that is merely due is not a
 * problem, and colouring it like one is how a screen teaches people to ignore
 * its colours.
 *
 * Amounts are formatted here and handed down by key, as on stock operations
 * and for the same reason: the locale lives on the server, and there is no
 * sense shipping a currency formatter to render three dozen static figures.
 *
 * Five of the seven tabs now draw real rows — `books-server.ts` fetches them
 * and hands back the fixture wherever a read came up empty. Every total below
 * is summed over those rows rather than over the module-level lists, which is
 * the whole point: a KPI computed from the fixture while the table underneath
 * it shows live invoices is a header that contradicts its own body.
 */
export default async function BooksPage() {
  const [nav, t, act, locale, books] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.books'),
    getTranslations('console.actions'),
    getLocale(),
    booksScreen(),
  ]);

  const lang = locale as Lang;
  const money = (tiyin: number) => formatTiyinAmount(Math.round(tiyin), lang);

  /*
   * The three expense figures, over whatever the table is actually drawing.
   *
   * `expenseTotal()` and `unpaidTotal()` in `books-data.ts` close over the
   * fixture list, which is the one thing they cannot do once the rows come from
   * the API — the same problem the payables figures below already solve.
   */
  const expenseRows = books.expenses.rows;
  const spent = books.expenses.live
    ? expenseRows.reduce((total, row) => total + row.amount, 0)
    : expenseTotal();
  /*
   * What is filed and not yet paid, over whatever the table is drawing.
   *
   * Both figures used to be zeroed on the live path with a paragraph saying
   * `finance.expenses` had no paid column. It has one now, so this is the same
   * arithmetic in both directions — and it has to be done here rather than in
   * `books-data.ts`, whose `unpaidTotal()` closes over the fixture list.
   */
  const unpaidRows = books.expenses.live
    ? expenseRows.filter((row) => !row.paid)
    : EXPENSES.filter((expense) => !expense.paid);
  const unpaid = books.expenses.live
    ? unpaidRows.reduce((total, row) => total + row.amount, 0)
    : unpaidTotal();
  const unpaidCount = unpaidRows.length;

  /*
   * The month's plan, or nothing.
   *
   * `EXPENSE_BUDGET` is the design's 52M so'm and is the fixture's own figure;
   * a live console reads `targets.expense_monthly_tiyin` off the restaurant's
   * settings document. Null there means nobody has set one, which is why the
   * three keys below are simply absent in that case rather than computed
   * against zero — the KPI strip checks for the key and drops the cards.
   */
  const budget = books.expenses.live ? books.budgetTiyin : EXPENSE_BUDGET;

  /*
   * The wage fund, summed from the payslips the table draws.
   *
   * `PAYROLL_FUND` is a constant — 128.4M so'm — and it used to be printed over
   * a live payslip table whatever the run came to. Advance paid and remaining
   * are dropped on a live run rather than derived: an advance is money already
   * handed over and nothing on `staff.payroll` records one.
   */
  const payrollGross = books.payroll.rows.reduce((total, row) => total + netPay(row), 0);
  const payrollFund = books.payroll.live ? payrollGross : PAYROLL_FUND;

  /*
   * The payables figures, over whatever the table is actually drawing.
   *
   * `payableTotal()`, `overdueTotal()` and `dueSoonTotal()` in `books-data.ts`
   * close over the fixture list — which is the one thing they cannot do once
   * the rows come from the API — so the same three predicates are applied here
   * to the rows that will be rendered. On a fixture console the rows ARE that
   * list and the three figures come out identical.
   */
  const unsettled = books.payables.rows.filter((row) => !row.paid);
  const late = unsettled.filter((row) => row.dueInDays < 0);
  const soon = unsettled.filter((row) => row.dueInDays >= 0 && row.dueInDays <= 7);
  const sum = (rows: readonly { amount: number }[]) =>
    rows.reduce((total, row) => total + row.amount, 0);

  const amounts: Record<string, string> = {
    expenseTotal: money(spent),
    unpaidTotal: money(unpaid),
    ...(budget === null
      ? {}
      : {
          budget: money(budget),
          budgetPercent: String(Math.round((spent / budget) * 100)),
          budgetLeft: money(Math.max(0, budget - spent)),
        }),
    unpaidCount: t('documents', { n: unpaidCount }),

    payableTotal: money(sum(unsettled)),
    overdueTotal: money(sum(late)),
    overdueCount: t('invoices', { n: late.length }),
    dueSoonTotal: money(sum(soon)),

    payrollFund: money(payrollFund),
    payrollNote: books.payroll.live
      ? t('payrollNoteLive', { n: books.payroll.rows.length })
      : t('payrollNote', { n: PAYROLL_STAFF, percent: PAYROLL_SHARE }),
    advancePaid: money(ADVANCE_PAID),
    payrollRemaining: money(PAYROLL_FUND - ADVANCE_PAID),
  };

  for (const expense of expenseRows) amounts[`exp_${expense.id}`] = money(expense.amount);
  for (const row of categoryTotals(expenseRows)) amounts[`cat_${row.category}`] = money(row.amount);
  for (const row of books.payables.rows) amounts[`ap_${row.id}`] = money(row.amount);

  /* The debtors the tab will actually draw — the restaurant's own on a live
     console — rather than the design's three. */
  for (const row of books.receivables.rows) {
    amounts[`ar_${row.id}`] = money(row.amount);
    if (row.limit !== null) amounts[`limit_${row.id}`] = money(row.limit);
  }

  for (const bucket of AGEING) {
    amounts[`age_${bucket.key}`] = money(
      bucketTotal(books.receivables.rows, bucket.from, bucket.to),
    );
  }

  for (const row of books.payroll.rows) {
    amounts[`base_${row.id}`] = money(row.base);
    amounts[`bonus_${row.id}`] = money(row.bonus);
    amounts[`hold_${row.id}`] = money(row.deductions);
    amounts[`net_${row.id}`] = money(netPay(row));
  }

  for (const period of books.periods.rows) amounts[`period_${period.key}`] = money(period.revenue);

  /*
   * The register, and its four totals. Keyed by position rather than by
   * acquisition date: the fixture's seven dates happen to be distinct, but a
   * real register has two rows bought on the same day the first time a
   * restaurant fits out a branch — and two rows sharing a key means the second
   * silently overwrites the first's figures under the first's name.
   */
  const assets = books.assets.rows;

  assets.forEach((asset, index) => {
    amounts[`faAssetCost_${index}`] = money(asset.cost);
    amounts[`faAssetMonthly_${index}`] = money(asset.monthly);
    amounts[`faAssetAccum_${index}`] = money(accumulated(asset));
    amounts[`faAssetBook_${index}`] = money(bookValue(asset));
  });

  amounts.faCost = money(assets.reduce((total, asset) => total + asset.cost, 0));
  amounts.faAccum = money(assets.reduce((total, asset) => total + accumulated(asset), 0));
  amounts.faBook = money(assets.reduce((total, asset) => total + bookValue(asset), 0));
  amounts.faMonthly = money(
    assets.reduce((total, asset) => total + (stillCharging(asset) ? asset.monthly : 0), 0),
  );

  /* The ledger. Amounts go down unsigned — the row draws its own sign, because
     the minus belongs to the colour and the column, not to the figure. Keyed
     by position for the same reason the register is: two takings in the same
     minute with no order number on either share a timestamp and a label. */
  books.moves.rows.forEach((move, index) => {
    amounts[`mvRow_${index}`] = money(Math.abs(move.amount));
    amounts[`mvBal_${index}`] = money(books.moves.balances[index] ?? 0);
  });

  amounts.mvIn = money(books.moves.in);
  amounts.mvOut = money(books.moves.out);
  amounts.mvNet = money(books.moves.in - books.moves.out);
  amounts.mvNetPositive = String(books.moves.in >= books.moves.out);
  amounts.mvBalance = money(books.moves.balance);

  for (const row of RECONCILIATION) {
    amounts[`sys_${row.key}`] = money(row.system);
    amounts[`real_${row.key}`] = money(row.actual);
    amounts[`diff_${row.key}`] = money(Math.abs(delta(row)));
  }

  const labels: Record<string, string> = {
    /* Five of the seven tab labels are in the console catalogue; the two the
       design adds are not, and their words live beside their data rather than
       in a catalogue every other screen also loads. */
    ...Object.fromEntries(
      BOOKS_TABS.filter((key) => key !== 'assets' && key !== 'moves').map((key) => [
        `tab_${key}`,
        t(`tab_${key}`),
      ]),
    ),
    tab_assets: say(LEDGER_COPY.tabAssets, lang),
    tab_moves: say(LEDGER_COPY.tabMoves, lang),

    /* What each write says once it has landed. `filingSent` is the odd one out
       and is still only a toast: filing leaves the building, and none of what
       it needs is code in this repository. */
    expenseSaved: act('expenseSaved'),
    markedPaid: act('markedPaid'),
    debtReceived: act('debtReceived'),
    payrollFinalised: act('payrollFinalised'),
    periodClosed: act('periodClosed'),
    filingSent: act('filingSent'),
    ...Object.fromEntries(
      (['rent', 'utilities', 'payroll', 'food', 'marketing', 'repairs', 'other'] as const).map(
        (key) => [`cat_${key}`, t(`cat_${key}`)],
      ),
    ),
    ...Object.fromEntries(
      (['manager', 'waiter', 'cashier', 'kitchen', 'warehouse'] as const).map((key) => [
        `role_${key}`,
        t(`role_${key}`),
      ]),
    ),
    ...Object.fromEntries(
      (['cash', 'card', 'wallet', 'bank'] as const).map((key) => [
        `recon_${key}`,
        t(`recon_${key}`),
      ]),
    ),
    ...Object.fromEntries(
      (['pending', 'ready', 'sent', 'signed'] as const).map((key) => [
        `state_${key}`,
        t(`state_${key}`),
      ]),
    ),
    ...Object.fromEntries(
      (['open', 'send', 'download'] as const).map((key) => [`action_${key}`, t(`action_${key}`)]),
    ),
    ...Object.fromEntries(AGEING.map((bucket) => [`age_${bucket.key}`, t(`age_${bucket.key}`)])),

    kpiSpent: t('kpiSpent'),
    kpiUnpaid: t('kpiUnpaid'),
    kpiLeft: t('kpiLeft'),
    ofBudget: t.raw('ofBudget') as string,
    forMonth: t('forMonth'),
    addExpense: t('addExpense'),
    save: t('save'),
    cancel: t('cancel'),
    breakdown: t('breakdown'),
    paid: t('paid'),
    unpaid: t('unpaid'),
    markPaid: t('markPaid'),
    markUnpaid: t('markUnpaid'),

    kpiPayable: t('kpiPayable'),
    overdue: t('overdue'),
    dueSoon: t('dueSoon'),
    toPay: t('toPay'),
    suppliers: t.raw('suppliers') as string,
    payableTitle: t('payableTitle'),
    payableSub: t('payableSub'),
    pay: t('pay'),
    daysLate: t.raw('daysLate') as string,
    daysLeft: t.raw('daysLeft') as string,
    receivableTitle: t('receivableTitle'),
    receivableSub: t('receivableSub'),
    receivableNote: t('receivableNote'),
    receive: t('receive'),
    limit: t.raw('limit') as string,
    noLimit: t('noLimit'),
    days: t.raw('days') as string,

    kpiFund: t('kpiFund'),
    kpiAdvance: t('kpiAdvance'),
    kpiRemaining: t('kpiRemaining'),
    advanceNote: t('advanceNote'),
    remainingNote: t('remainingNote'),
    finalise: t('finalise'),

    closeTitle: t('closeTitle'),
    closeSub: t('closeSub'),
    closeButton: t('closeButton'),
    closed: t('closed'),
    open: t('open'),
    inProgress: t('inProgress'),
    blockedByRecon: t('blockedByRecon'),
    reconTitle: t('reconTitle'),
    reconSub: t('reconSub'),
    systemIs: t.raw('systemIs') as string,
    actualIs: t.raw('actualIs') as string,
    matched: t('matched'),

    docsSub: t('docsSub'),

    colDate: t('colDate'),
    colNote: t('colNote'),
    colCategory: t('colCategory'),
    colAmount: t('colAmount'),
    colStatus: t('colStatus'),
    colSupplier: t('colSupplier'),
    colDocument: t('colDocument'),
    colDue: t('colDue'),
    colBalance: t('colBalance'),
    colCustomer: t('colCustomer'),
    colPhone: t('colPhone'),
    colAge: t('colAge'),
    colOwed: t('colOwed'),
    colStaff: t('colStaff'),
    colBase: t('colBase'),
    colBonus: t('colBonus'),
    colDeductions: t('colDeductions'),
    colNet: t('colNet'),

    /* What each tab says when its own table has nothing in it — a live
       restaurant that has filed no expense, built no payslip and closed no
       month. Each of the three used to draw the design's rows instead. */
    noBudget: t('noBudget'),
    emptyExpenses: t('emptyExpenses'),
    emptyPayroll: t('emptyPayroll'),
    emptyReceivables: t('emptyReceivables'),
    markedUnpaid: act('markedUnpaid'),
    emptyPeriods: t('emptyPeriods'),
  };

  /*
   * The header states the month it drew and whether that month is closed.
   *
   * `t('subtitle')` asserts "1 July – 31 July · all branches · closed and
   * reconciled on 3 August" — an accounting claim, from the catalogue, about a
   * restaurant that has closed nothing. The period rows are the register's own
   * and row zero is the month still running, so this is read rather than said.
   */
  const current = books.periods.live ? books.periods.rows[0] : undefined;

  const subtitle =
    books.periods.live && current !== undefined
      ? t('subtitleLive', {
          month: say(current.month, lang),
          status: current.closed ? t('statusClosed') : t('statusOpen'),
        })
      : books.periods.live
        ? t('noPeriod')
        : t('subtitle');

  return (
    <>
      <PageHead title={nav('books')} subtitle={subtitle} />
      <BooksTabs lang={lang} labels={labels} money={amounts} books={books} />
    </>
  );
}
