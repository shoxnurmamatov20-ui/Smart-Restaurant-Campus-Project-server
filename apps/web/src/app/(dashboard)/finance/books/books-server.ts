import { apiGet, type Paginated } from '@/lib/api-server';

import {
  BALANCE_NOW,
  EXPENSES,
  FIXED_ASSETS,
  MONEY_MOVES,
  moneyIn,
  moneyOut,
  movementBalances,
  PAYABLES,
  PAYROLL,
  PERIODS,
  RECEIVABLES,
  type Expense,
  type ExpenseCategory,
  type FixedAsset,
  type MoneyMove,
  type Payable,
  type PayrollRow,
  type Receivable,
  type Period,
  type Trilingual,
} from './books-data';

/**
 * The books, with the five sections that now have tables behind them.
 *
 * Server half of ./books-data.ts, split per the house rule: types and fixtures
 * in the `*-data.ts`, anything that calls the API in a sibling only server
 * components import (`tables-server.ts` explains why the two cannot be one
 * file — this screen's tab strip is a client component).
 *
 * Five reads replace five paragraphs that each began "there is no table for
 * this". There now is: supplier invoices carry `paid_amount` and `paid_at`,
 * `staff.payroll_periods` freezes a run, `finance.accounting_periods` locks a
 * month against backdating, `finance.fixed_assets` holds the register, and
 * `GET /finance/cash-book` assembles payments, expenses and movements into one
 * ledger with a running balance.
 *
 * `books-data.ts` is frozen and the mapping runs INTO its types rather than
 * widening them. That is not deference to a file — it is what keeps this screen
 * renderable with no session at all. Every section falls back to the fixture it
 * was built against, so an API mid-restart shows last month's demo instead of a
 * 500, and the `live` flag beside each section is how the caller can tell which
 * it got.
 *
 * ---------------------------------------------------------------------------
 * Paths have no `/v1` on them
 *
 * `apiBase()` already ends `.../api/v1`, so a path written as `/v1/finance/...`
 * asks for `/api/v1/v1/finance/...`, gets a 404, and `apiGet` answers `null` —
 * which every screen renders as its fixture. `settings-server.ts` shipped with
 * three "live" reads that had never once returned a row for exactly this
 * reason, and nothing on screen said so, because falling back to fixtures is
 * what a healthy console does when the API is restarting.
 *
 * ---------------------------------------------------------------------------
 * What is still fixture, and why it is not an oversight
 *
 * Expenses, receivables, reconciliation and the filings. Expenses have an
 * endpoint and no ageing question to answer, so the tab reads as it always did;
 * receivables need the oldest unsettled `crm.account_entries` row per guest and
 * `GET /crm/accounts` does not carry it, which would cost the age column and
 * the four ageing buckets — the whole reason an accountant opens that tab;
 * reconciliation is a bank statement somebody has to type in; and filing leaves
 * the building entirely (see `docs/GO-LIVE.md`).
 */

/** One filed expense — `GET /api/v1/finance/expenses`. */
type ApiExpense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  spent_at: string | null;
  created_at: string | null;
  /**
   * Whether the money has actually left.
   *
   * `finance.expenses` grew a `paid_at` column: a drawer payout is paid the
   * moment it is written, an invoice filed on this screen is not. Before that
   * the design's paid/unpaid chip was a fact on a live row and a control only
   * on the fixture — a manager could mark the rent unpaid, watch it change,
   * reload, and find it paid again.
   */
  is_paid: boolean;
};

/**
 * One guest's tab — `GET /api/v1/crm/accounts`.
 *
 * `oldest_unsettled_at` is the field this tab could not be drawn without. It is
 * absent rather than null when the read did not compute it, which is why the
 * type says `?` as well as `| null`: "we did not ask" and "this guest owes
 * nothing" must not both become an age of zero days.
 */
type ApiGuestAccount = {
  customer_id: number;
  name: string;
  phone: string | null;
  credit_limit: number;
  balance: number;
  oldest_unsettled_at?: string | null;
};

/** The tenant's own document — `GET /api/v1/settings`. */
type ApiSettings = {
  data: { settings?: { targets?: { expense_monthly_tiyin?: number } } };
};

/** One supplier invoice. `outstanding` is what is still owed, in tiyin. */
type ApiPurchaseOrder = {
  id: number;
  supplier?: { id: number; name: string } | null;
  number: string;
  status: string;
  expected_at: string | null;
  received_at: string | null;
  created_at: string | null;
  total: number;
  paid_amount: number;
  paid_at: string | null;
  outstanding: number;
  note: string | null;
};

/** A payroll run. `lines` arrives only from the detail read — see below. */
type ApiPayrollRun = {
  id: number;
  period: string;
  status: string;
  is_finalised: boolean;
  gross_tiyin: number;
  deductions_tiyin: number;
  net_tiyin: number;
  lines_count?: number;
  lines?: readonly ApiPayrollLine[];
};

/** One payslip. Five money components, of which the design draws four columns. */
type ApiPayrollLine = {
  id: number;
  staff_member_id: number;
  full_name: string | null;
  position: string | null;
  basic_tiyin: number;
  service_charge_tiyin: number;
  bonus_tiyin: number;
  deductions_tiyin: number;
  net_tiyin: number;
};

/** One month of the ledger. `id` is null for a month nobody has touched yet. */
type ApiPeriod = {
  id: number | null;
  period: string;
  status: 'open' | 'closed' | string;
  revenue_tiyin: number;
  expenses_tiyin: number;
};

/** One asset, with the two figures the controller computed for the month asked. */
type ApiFixedAsset = {
  id: number;
  branch_id: number | null;
  name: string;
  category: string;
  acquired_on: string;
  cost: number;
  residual: number;
  useful_life_months: number;
  monthly_charge: number;
  disposed_on: string | null;
  accumulated?: number;
  book_value?: number;
};

/** One ledger row. `amount` is SIGNED tiyin and `balance` is the running total. */
type ApiCashEntry = {
  source: 'payment' | 'expense' | 'movement' | string;
  id: number;
  occurred_at: string;
  kind: string;
  label: string | null;
  method: string | null;
  amount: number;
  cash_shift_id: number | null;
  cash_account_id: number | null;
  balance: number;
};

type ApiCashBook = {
  opening_balance: number;
  closing_balance: number;
  totals: { in: number; out: number; net: number };
  entries: readonly ApiCashEntry[];
};

/** Where money sits when it is not in a drawer. */
type ApiCashAccount = {
  id: number;
  name: string;
  title?: string | null;
  is_active: boolean;
};

type ApiBranch = { id: number; name: string };

/** One end of the transfer form's two selects. */
export type TransferAccount = { id: number; name: string };

export type BooksScreen = {
  /**
   * The month's expenses, and whether they are the restaurant's own.
   *
   * This tab drew `EXPENSES` unconditionally — seven of the design's invoices,
   * rent in Chilonzor included — beside live payables and a live cash book, in
   * the same tab strip. `GET /finance/expenses` is the same endpoint the till
   * screen already reads and the same one the add form already writes to.
   */
  expenses: { rows: readonly Expense[]; live: boolean };
  payables: { rows: readonly Payable[]; live: boolean };
  /**
   * Who owes the restaurant, and since when.
   *
   * This half of the debts tab was hidden on a live console rather than drawn,
   * and the reason was the age column: `GET /crm/accounts` answered a balance,
   * and a balance has no date on it. The ageing buckets and the age beside each
   * debtor ARE the reason an accountant opens the tab — a list of names and
   * amounts with no age is a list nobody can act on.
   *
   * `oldest_unsettled_at` now rides on that read, so both are real.
   */
  receivables: { rows: readonly Receivable[]; live: boolean };
  /**
   * What the business meant to spend this month, in tiyin — or null.
   *
   * `config/settings.php` → `targets.expense_monthly_tiyin`, the only plan
   * figure on the platform. Null when nobody has set one, which is a different
   * thing from zero: the KPI draws a dash rather than reporting every so'm as
   * an overspend against a budget of nothing.
   */
  budgetTiyin: number | null;
  /**
   * The run, and the id the finalise button needs.
   *
   * `runId` is null whenever the rows are the fixture — including the case
   * where the API answered and simply has no run yet — so the button has one
   * question to ask rather than two, and can never post an id that belongs to
   * a month nobody built.
   */
  payroll: { rows: readonly PayrollRow[]; runId: number | null; live: boolean };
  periods: { rows: readonly Period[]; live: boolean };
  assets: { rows: readonly FixedAsset[]; live: boolean };
  moves: {
    rows: readonly MoneyMove[];
    /**
     * The balance after each row, aligned with `rows` by index.
     *
     * Carried alongside rather than recomputed, because the API walks it
     * forwards from the accounts' own opening figures and this screen only
     * knows the newest end. `movementBalances()` walks backwards from
     * `BALANCE_NOW`, which is the only thing a fixture CAN do and is wrong the
     * moment a real ledger is longer than the page.
     */
    balances: readonly number[];
    /**
     * The window's totals, straight from the API.
     *
     * The two grey subtitles above them — "over 3 days" and "5 entries" — are
     * `LEDGER_COPY` and are the fixture's window, not this one's. They are left
     * alone rather than quietly recomputed: they are copy, `books-data.ts` is
     * frozen, and a sentence about the data written in a mapping function is
     * how a screen ends up with two catalogues. Stating the real window needs
     * a `console.books` entry.
     */
    in: number;
    out: number;
    balance: number;
    accounts: readonly TransferAccount[];
    live: boolean;
  };
};

/**
 * Month names, written out.
 *
 * `Intl.DateTimeFormat` would answer this and is the wrong tool twice: ICU
 * writes Uzbek months in lower case while the design's rows are capitalised,
 * and which ICU a container shipped with then decides how the console reads —
 * a fidelity difference nobody can reproduce from the source. Twelve rows of
 * three words is cheaper than that argument.
 */
const MONTHS: readonly Trilingual[] = [
  { uz: 'Yanvar', ru: 'Январь', en: 'January' },
  { uz: 'Fevral', ru: 'Февраль', en: 'February' },
  { uz: 'Mart', ru: 'Март', en: 'March' },
  { uz: 'Aprel', ru: 'Апрель', en: 'April' },
  { uz: 'May', ru: 'Май', en: 'May' },
  { uz: 'Iyun', ru: 'Июнь', en: 'June' },
  { uz: 'Iyul', ru: 'Июль', en: 'July' },
  { uz: 'Avgust', ru: 'Август', en: 'August' },
  { uz: 'Sentabr', ru: 'Сентябрь', en: 'September' },
  { uz: 'Oktabr', ru: 'Октябрь', en: 'October' },
  { uz: 'Noyabr', ru: 'Ноябрь', en: 'November' },
  { uz: 'Dekabr', ru: 'Декабрь', en: 'December' },
];

/**
 * The four things the cash book distinguishes.
 *
 * Our own vocabulary rather than somebody's text, which is why these get three
 * languages while a row's `label` does not: `kind` is a closed enum the ledger
 * itself assigns, so translating it is naming our own words, not putting
 * sentences in a manager's mouth.
 *
 * The expense's own category — rent, utilities, repairs — is lost here, and
 * deliberately: those seven words live in the console catalogue, which a server
 * module cannot reach, and the expenses tab is where a reader looks for them.
 */
const KINDS: Readonly<Record<string, Trilingual>> = {
  takings: { uz: 'Savdo tushumi', ru: 'Выручка', en: 'Sales' },
  expense: { uz: 'Xarajat', ru: 'Расход', en: 'Expense' },
  movement: { uz: 'Pul harakati', ru: 'Движение денег', en: 'Cash movement' },
  transfer: { uz: "Pul o'tqazmasi", ru: 'Перевод', en: 'Transfer' },
};

const TILL: Trilingual = { uz: 'Kassa', ru: 'Касса', en: 'Till' };
const EVERY_BRANCH: Trilingual = { uz: 'Barcha filiallar', ru: 'Все филиалы', en: 'All branches' };
const NOTHING: Trilingual = { uz: '—', ru: '—', en: '—' };

/**
 * A value that exists in exactly one language, in all three fields.
 *
 * An asset called "Sovutish kamerasi" was typed once, by one person, in the
 * language they were thinking in. There is no second version of it and this
 * screen must not invent one — a machine translation of somebody's own words
 * on a register that an auditor reads is worse than showing them as written.
 */
const asWritten = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

/**
 * The nine roster positions folded into the five the payroll table draws.
 *
 * Lossy on purpose. `console.books` holds exactly five `role_*` words and this
 * screen is locked to a design file, so a sixth would be copy invented in a
 * mapping function. Bartender, host and courier have no group of their own and
 * land on `waiter` — front of house, which is the nearest thing that is true
 * of all three. The day a payslip has to state the exact position, the fix is a
 * catalogue entry, not a branch here.
 */
const POSITIONS: Readonly<Record<string, PayrollRow['role']>> = {
  manager: 'manager',
  waiter: 'waiter',
  bartender: 'waiter',
  host: 'waiter',
  courier: 'waiter',
  cashier: 'cashier',
  cook: 'kitchen',
  chef: 'kitchen',
  storekeeper: 'warehouse',
};

/**
 * Everything on this screen that has a table behind it.
 *
 * One call per section, in parallel, because they answer five different
 * modules and a screen that awaited them in order would wait five round trips
 * to draw one page. The payroll run is the one exception and says why at its
 * own function: the list read does not carry payslip lines.
 */
export async function booksScreen(): Promise<BooksScreen> {
  const [orders, runs, periods, assets, ledger, accounts, branches, expenses, tabs, settings] =
    await Promise.all([
      /*
       * Received orders only, oldest expected first.
       *
       * A draft or a sent order is a document nobody owes money on yet — it has
       * not arrived. Sorting by `expected_at` rather than the default
       * `-created_at` puts the most urgent invoice at the top, which is the order
       * a payables table is read in.
       */
      apiGet<Paginated<ApiPurchaseOrder>>(
        '/suppliers/purchase-orders?per_page=50&filter[status]=received&include=supplier&sort=expected_at',
      ),
      apiGet<Paginated<ApiPayrollRun>>('/staff/payroll?per_page=1'),
      /*
       * Six months, which is what the close panel lists. More would be a scroll
       * inside a card; fewer would hide a month that was never closed, and an
       * unclosed month from last quarter is precisely what this panel exists to
       * surface.
       */
      apiGet<{ data: ApiPeriod[] }>('/finance/periods?months=6'),
      /*
       * No `month=`. The controller defaults to the venue's own trading month,
       * which is a better answer than this process's clock: a restaurant whose
       * day ends at 06:00 is still trading the 31st at 02:00 on the 1st, and a
       * register that flipped to the new month five hours early would sit beside
       * a statement that had not.
       */
      apiGet<{ data: ApiFixedAsset[] }>('/finance/fixed-assets?per_page=100'),
      /*
       * No window either, and for the same reason — the API defaults to the
       * current month to date on the venue's calendar. The window is capped at 92
       * days upstream, so this read can never become a full scan.
       */
      apiGet<ApiCashBook>('/finance/cash-book'),
      apiGet<{ data: ApiCashAccount[] }>('/finance/cash-book/accounts'),
      apiGet<Paginated<ApiBranch>>('/branches?per_page=100'),
      /*
       * Newest first, which is the order the table reads. Fifty is the design's
       * page and is more than a month of paperwork for most restaurants; the
       * breakdown beside the table is computed over exactly what is drawn, so it
       * cannot disagree with it.
       */
      apiGet<Paginated<ApiExpense>>('/finance/expenses?per_page=50&sort=-spent_at'),
      /*
       * Everybody who has a tab or a balance — not every guest on file.
       *
       * The endpoint narrows to accounts before any filter is applied, so a
       * restaurant with forty thousand customers and eleven credit accounts gets
       * eleven rows. Biggest debt first is its default sort, which is the order
       * this table is read in.
       */
      apiGet<{ data: ApiGuestAccount[] }>('/crm/accounts?per_page=50'),
      /*
       * The month's expense budget, from the restaurant's own settings document.
       *
       * A plan rather than a ledger figure, and the only one on the platform. A
       * reader without `settings.view` gets `null` here and the budget cards drop
       * — which is right: a spend-against-plan card with no plan behind it is the
       * design's 52M so'm printed over somebody else's month.
       */
      apiGet<ApiSettings>('/settings'),
    ]);

  const run = runs?.data?.[0];
  const detail =
    run === undefined ? null : await apiGet<{ data: ApiPayrollRun }>(`/staff/payroll/${run.id}`);

  return {
    expenses: expensesFrom(expenses?.data),
    payables: payablesFrom(orders?.data),
    receivables: receivablesFrom(tabs?.data),
    budgetTiyin: budgetFrom(settings),
    payroll: payrollFrom(detail?.data),
    periods: periodsFrom(periods?.data),
    assets: assetsFrom(assets?.data, branches?.data),
    moves: movesFrom(ledger, accounts?.data),
  };
}

/**
 * `Expense::CATEGORIES` against the seven words the design's picker draws.
 *
 * The mirror of `api/finance/expenses/route.ts`, which maps the other way for
 * the write. Two names differ — the API says `purchase` and `repair` — and the
 * eighth, `refund`, is written by the ledger when a bill is reversed rather
 * than typed by anyone; it lands under `other` here because the table has no
 * column for a category the picker cannot offer.
 */
const CATEGORY_OF: Readonly<Record<string, ExpenseCategory>> = {
  rent: 'rent',
  utilities: 'utilities',
  payroll: 'payroll',
  purchase: 'food',
  marketing: 'marketing',
  repair: 'repairs',
  other: 'other',
  refund: 'other',
};

/**
 * The expense table, from the restaurant's own ledger.
 *
 * An empty list is an answer — a restaurant that has filed nothing this month —
 * and the tab draws its empty state for it. The fixture is only for `undefined`,
 * which is no session or an API that did not reply.
 */
function expensesFrom(rows: readonly ApiExpense[] | undefined): BooksScreen['expenses'] {
  if (rows === undefined) return { rows: EXPENSES, live: false };

  return {
    rows: rows.map((row): Expense => ({
      id: String(row.id),
      // `dd.mm`, which is what the design's column shows.
      date: shortDate(row.spent_at ?? row.created_at),
      category: CATEGORY_OF[row.category] ?? 'other',
      // Somebody typed it, in one language. `asWritten` is the same admission
      // the register and the payables note make.
      note: asWritten(row.description),
      amount: row.amount,
      /*
       * Read, not assumed.
       *
       * This was hard-coded `true` with a paragraph saying an expense row IS
       * money that left. That is true of a drawer payout and false of the
       * paperwork this screen files: the electricity invoice arrives on the
       * 3rd and is paid on the 20th, and between the two the restaurant owes
       * money it has already booked. `finance.expenses.paid_at` is what says
       * which, and the chip on the table is now a control rather than a label.
       */
      paid: row.is_paid,
    })),
    live: true,
  };
}

/** `dd.mm` from an ISO stamp, or an em dash when there is none. */
function shortDate(iso: string | null): string {
  if (iso === null) return '—';

  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/**
 * Spend per category over whatever the table is drawing, biggest first.
 *
 * `byCategory()` in `books-data.ts` closes over the fixture list, which is the
 * one thing it cannot do once the rows come from the API — the same problem
 * `page.tsx` already solves for the payables figures.
 */
function payablesFrom(orders: readonly ApiPurchaseOrder[] | undefined): BooksScreen['payables'] {
  if (orders === undefined) return { rows: PAYABLES, live: false };

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const rows = orders
    .filter((order) => order.outstanding > 0 && order.paid_at === null)
    .map((order): Payable => {
      return {
        id: String(order.id),
        supplier: order.supplier?.name ?? '—',
        /*
         * The order's note, or nothing. A purchase order's goods are its item
         * lines, and pulling them in would be `include=items` on every row to
         * fill one grey sub-line; where the buyer wrote a note it says more
         * than a list of ingredients would anyway.
         */
        what: order.note === null ? NOTHING : asWritten(order.note),
        document: order.number,
        /*
         * Days against the DELIVERY date, because there is no other date to
         * count from.
         *
         * `suppliers.purchase_orders` has no payment-terms column and no due
         * date — it has `expected_at` (when the van was due) and `received_at`
         * (when it came). So the rule this table states is the one the schema
         * can support: with no terms recorded, an invoice is due when the goods
         * arrive. Every received, unpaid row therefore reads as due or late,
         * and the "due within 7 days" figure above the table reads zero on a
         * live console. That is not the KPI breaking; it is what "no terms
         * recorded" means. When a terms column lands, this line is the only one
         * that changes.
         */
        dueInDays: daysFrom(order.received_at ?? order.expected_at ?? order.created_at, today),
        // What is still owed, which is what the column is headed with — not the
        // order total, because a part payment has already left the building.
        amount: order.outstanding,
      };
    });

  return { rows, live: true };
}

/**
 * The debtors' table, and the age that makes it actionable.
 *
 * Only guests who actually owe something. A guest holding a deposit has a
 * negative balance and is not a debtor; putting them on this list is how a
 * collections call gets made to somebody the restaurant owes money to.
 *
 * An empty list is an answer — a restaurant nobody owes anything — and the tab
 * draws its empty state for it. The fixture is only for `undefined`, which is
 * no session, an API that did not reply, or a reader without `crm.view`.
 */
export function receivablesFrom(
  tabs: readonly ApiGuestAccount[] | undefined,
  now: Date = new Date(),
): BooksScreen['receivables'] {
  if (tabs === undefined) return { rows: RECEIVABLES, live: false };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return {
    rows: tabs
      .filter((tab) => tab.balance > 0)
      .map((tab): Receivable => ({
        id: String(tab.customer_id),
        // A guest's name is a proper noun and is not translated.
        customer: tab.name,
        phone: tab.phone ?? '—',
        /*
         * Days since the money still owed was first charged.
         *
         * Zero when the server did not carry a date — which is what the field
         * being absent means — rather than a guess. Zero reads as "today",
         * which is the least alarming bucket, and that is the right way to be
         * wrong: an invented 90 puts a good customer in the red column.
         */
        ageDays: ageOf(tab.oldest_unsettled_at ?? null, today),
        amount: tab.balance,
        // Zero is "no ceiling agreed" on the API's side; the column has a word
        // for that and it is not "0 so'm".
        limit: tab.credit_limit > 0 ? tab.credit_limit : null,
      })),
    live: true,
  };
}

/** Whole days between an ISO stamp and today, floored at zero. */
function ageOf(iso: string | null, today: number): number {
  if (iso === null) return 0;

  const day = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(day) ? 0 : Math.max(0, Math.round((today - day) / 86_400_000));
}

/**
 * The month's expense budget, or null.
 *
 * Zero is read as absent, which is what `config/settings.php` says it means:
 * "nobody has set one". The alternative — treating it as a budget of nothing —
 * makes every restaurant that has never opened the settings screen report a
 * hundred per cent overspend on its first expense.
 */
export function budgetFrom(settings: ApiSettings | null | undefined): number | null {
  const target = settings?.data.settings?.targets?.expense_monthly_tiyin;

  return target === undefined || target <= 0 ? null : target;
}

/**
 * The payroll table, from the newest run.
 *
 * Two reads rather than one because the list resource drops `lines` — the runs
 * list draws thirty months and would otherwise carry a thousand payslips nobody
 * is looking at. The newest run is the one a manager is working on, which is
 * why this asks for one row rather than computing a month: `-period` sorts
 * chronologically for free, and deriving `YYYY-MM` from this process's clock
 * would disagree with the venue's trading month for a few hours every month.
 *
 * The three KPIs above the table stay on the fixture and that is deliberate.
 * They read fund, advance paid and remaining; a run answers gross, deductions
 * and net. Those are not the same three figures — an advance is money already
 * handed over and a deduction is money held back — and putting one under the
 * other's label, on the screen a person opens to check their own wage, is the
 * single worst place on this platform to be approximately right.
 */
function payrollFrom(run: ApiPayrollRun | null | undefined): BooksScreen['payroll'] {
  const lines = run?.lines;

  /*
   * An empty run is a run, not a missing one.
   *
   * `lines.length === 0` used to fall back here, so an accountant who had just
   * created a run saw payslips for people who do not work there — with base pay
   * and bonuses — on the screen used to approve wages. The `runId` is kept so
   * the finalise button still addresses the real run.
   */
  if (run === null || run === undefined || lines === undefined) {
    return { rows: PAYROLL, runId: null, live: false };
  }

  const rows = lines.map((line): PayrollRow => {
    const name = line.full_name ?? '';

    return {
      id: String(line.id),
      name,
      initials: initialsOf(name),
      role: POSITIONS[line.position ?? ''] ?? 'waiter',
      base: line.basic_tiyin,
      /*
       * Service charge rides with the bonus, because the design has four money
       * columns and a payslip has five components.
       *
       * It belongs on this side rather than folded into the oklad for two
       * reasons. It is earned on the night rather than contracted, so a base
       * that moved week to week would be the wrong word for it; and adding it
       * here keeps `netPay()` — base plus bonus minus deductions — equal to the
       * run's own `net_tiyin`, so the frozen figure and the drawn one cannot
       * disagree.
       */
      bonus: line.service_charge_tiyin + line.bonus_tiyin,
      deductions: line.deductions_tiyin,
    };
  });

  return { rows, runId: run.id, live: true };
}

/**
 * The months, newest first.
 *
 * `current` is the first row rather than a date comparison, and that is exact:
 * the controller starts its cursor at the venue's own trading month and walks
 * backwards, so row zero IS the month still running. Comparing against this
 * process's clock would get it wrong for the few hours a night when the two
 * calendars disagree — and being wrong here means offering to close a month
 * that is still taking money.
 */
function periodsFrom(periods: readonly ApiPeriod[] | undefined): BooksScreen['periods'] {
  /*
   * An empty answer is a real "nothing to close yet".
   *
   * The controller walks backwards from the venue's own trading month, so it
   * only comes back empty for a restaurant that has not traded. Falling back
   * here told a brand-new venue that six months were closed and reconciled —
   * on the tab an accountant reads to decide what may still be edited.
   */
  if (periods === undefined) return { rows: PERIODS, live: false };

  const rows = periods.map((period, index): Period => {
    const month = Number(period.period.slice(5, 7));

    return {
      // `YYYY-MM`, which is what the close endpoint's path wants — so the row
      // carries the address of its own button rather than a nickname the
      // handler would have to translate back.
      key: period.period,
      month: monthName(month, period.period.slice(0, 4)),
      revenue: period.revenue_tiyin,
      closed: period.status === 'closed',
      current: index === 0,
    };
  });

  return { rows, live: true };
}

/**
 * The register.
 *
 * `used` — months already depreciated — is not a column upstream, and deriving
 * it from the calendar would be the obvious mistake: `accumulated` is capped at
 * `cost - residual`, so a fully written-down asset would keep counting months
 * and `books-data.ts`'s own `accumulated()` would drift past the figure the API
 * computed. Dividing the server's accumulated by the monthly charge inverts the
 * server's own arithmetic instead, which makes the four drawn figures equal to
 * the four it sent.
 *
 * Disposed rows are dropped. The table upstream is also a history — that is why
 * `disposed_on` exists — but a book value drawn for something the restaurant
 * has already sold is an asset on a balance sheet that nobody owns.
 */
function assetsFrom(
  assets: readonly ApiFixedAsset[] | undefined,
  branches: readonly ApiBranch[] | undefined,
): BooksScreen['assets'] {
  if (assets === undefined) return { rows: FIXED_ASSETS, live: false };

  const named = new Map((branches ?? []).map((branch) => [branch.id, branch.name]));

  const rows = assets
    .filter((asset) => asset.disposed_on === null)
    .map((asset): FixedAsset => {
      const monthly = asset.monthly_charge;
      const accumulated = asset.accumulated ?? 0;

      return {
        // One language in all three fields — see `asWritten`. The register is
        // typed by an accountant, not authored in a catalogue.
        name: asWritten(asset.name),
        where:
          asset.branch_id === null
            ? EVERY_BRANCH
            : asWritten(named.get(asset.branch_id) ?? String(asset.branch_id)),
        // `DD.MM.YYYY`, as an acquisition date is written on the document the
        // asset came with. The API sends `YYYY-MM-DD`.
        date: `${asset.acquired_on.slice(8, 10)}.${asset.acquired_on.slice(5, 7)}.${asset.acquired_on.slice(0, 4)}`,
        cost: asset.cost,
        life: asset.useful_life_months,
        used:
          monthly > 0
            ? Math.min(asset.useful_life_months, Math.round(accumulated / monthly))
            : asset.useful_life_months,
        monthly,
      };
    });

  return { rows, live: true };
}

/**
 * The cash book, newest first.
 *
 * Reversed on the way in, because the API answers oldest-first — a ledger's own
 * order, and the only order a running balance can be computed in — while the
 * screen reads newest-first, which is the order a person looks for what
 * happened tonight. The balances are reversed with it so a row and its balance
 * stay together.
 *
 * `who` is an em dash on every live row, and that is the honest answer rather
 * than a gap to fill later. A cash-book row carries no user: a payment names
 * the till it was taken at, an expense names who entered it nowhere, and only
 * the transfer records a `user_id` that the read does not publish. Guessing a
 * name onto a money row is not a cosmetic error — it is an accusation.
 */
function movesFrom(
  ledger: ApiCashBook | null | undefined,
  accounts: readonly ApiCashAccount[] | undefined,
): BooksScreen['moves'] {
  const options = (accounts ?? [])
    .filter((account) => account.is_active)
    .map((account): TransferAccount => ({
      id: account.id,
      name: account.title ?? account.name,
    }));

  if (ledger === null || ledger === undefined) {
    return {
      rows: MONEY_MOVES,
      balances: movementBalances(),
      in: moneyIn(),
      out: moneyOut(),
      balance: BALANCE_NOW,
      accounts: options,
      live: false,
    };
  }

  const named = new Map(
    (accounts ?? []).map((account) => [account.id, account.title ?? account.name]),
  );

  const entries = [...ledger.entries].reverse();

  const rows = entries.map((entry): MoneyMove => {
    const at = entry.occurred_at;

    return {
      /*
       * `DD.MM HH:MM`, sliced off the ISO string rather than parsed. The API
       * writes it on the venue's clock already, and putting it through `Date`
       * here would re-read it on this container's — which is how a 23:48 cash
       * drop ends up dated the next morning.
       *
       * An empty string is a real answer upstream: a payment with neither
       * `paid_at` nor `created_at` publishes `''`. It sorts to the top of the
       * ledger there and would slice into `". "` here, which reads as a
       * corrupted row rather than a missing time.
       */
      when: at.length >= 16 ? `${at.slice(8, 10)}.${at.slice(5, 7)} ${at.slice(11, 16)}` : '—',
      what: entry.label === null || entry.label === '' ? NOTHING : asWritten(entry.label),
      category: KINDS[entry.kind] ?? NOTHING,
      account: accountOf(entry, named),
      who: '—',
      // Already signed upstream: negative is money out. The row draws its own
      // sign, so the figure travels as the ledger stored it.
      amount: entry.amount,
    };
  });

  return {
    rows,
    balances: entries.map((entry) => entry.balance),
    in: ledger.totals.in,
    out: ledger.totals.out,
    balance: ledger.closing_balance,
    accounts: options,
    live: true,
  };
}

/**
 * Which place a ledger row belongs to.
 *
 * An account when the row names one, otherwise the drawer — and the drawer
 * without a number, because `cash_shift_id` is the id of a shift and not the
 * name of a till. Printing "Kassa 7" from a shift id would invent a till the
 * restaurant does not have, on the column a reader uses to find where the money
 * physically went.
 *
 * A card payment lands on the till too, which is right: the sale happened at
 * that till. The rail it settled over is the ledger's own `method` and is not
 * an account this business holds.
 */
function accountOf(entry: ApiCashEntry, named: Map<number, string>): Trilingual {
  if (entry.cash_account_id !== null) {
    return asWritten(named.get(entry.cash_account_id) ?? String(entry.cash_account_id));
  }

  return entry.cash_shift_id !== null ? TILL : NOTHING;
}

/** `Avgust 2026`, in three languages. The year is a number everywhere. */
function monthName(month: number, year: string): Trilingual {
  const name = MONTHS[month - 1] ?? NOTHING;

  return { uz: `${name.uz} ${year}`, ru: `${name.ru} ${year}`, en: `${name.en} ${year}` };
}

/**
 * Whole days from a timestamp to today. Negative once the date has passed.
 *
 * Both ends are truncated to a UTC midnight before subtracting, so the answer
 * is a count of calendar days rather than of 24-hour blocks — otherwise an
 * invoice dated this morning and one dated last night differ by a day
 * depending on what time the page is opened.
 */
function daysFrom(iso: string | null, today: number): number {
  if (iso === null) return 0;

  const day = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(day) ? 0 : Math.round((day - today) / 86_400_000);
}

/** `Aziza Rasulova` → `AR`. The avatar the design draws when there is no photo. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}
