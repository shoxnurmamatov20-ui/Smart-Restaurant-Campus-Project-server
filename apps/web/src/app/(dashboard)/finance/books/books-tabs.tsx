'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import {
  documentHref,
  printLink,
  type DocumentName,
} from '@/app/(documents)/documents/documents-copy';
import { apiId, post } from '@/lib/console-post';

import {
  accumulated,
  AGEING,
  bucketTotal,
  delta,
  EXPENSE_CATEGORIES,
  FILINGS,
  bookValue,
  DEPRECIATION_NOTES,
  LEDGER_COPY,
  RECONCILIATION,
  reconciles,
  say,
  stillCharging,
  type ExpenseCategory,
  type Lang,
  type Receivable,
  type Trilingual,
  BOOKS_TABS,
  type BooksTab,
} from './books-data';
import type { BooksScreen } from './books-server';
import { categoryTotals } from './books-data';

/**
 * The five tabs, and they switch.
 *
 * This screen shipped with four labels — the design has five, `documents` was
 * simply absent — rendered as `data-active={index === 0}` with no handler, so
 * only expenses was ever reachable. The same defect as stock operations and the
 * same cost: a control that looks like a control and does nothing.
 *
 * Client, for the tab state and the paid toggles. Everything it draws arrives
 * translated and formatted; the catalogue and the money formatter stay on the
 * server.
 *
 * The rows arrive as a prop rather than being imported from `books-data.ts`.
 * That is the whole shape of this file's wiring: `books-server.ts` decides per
 * section whether a table came from the API or from the fixture, and this
 * component draws whichever it was handed without knowing the difference. Six
 * of the seven panels now write for real; the seventh, filing, leaves the
 * building and says so in one line.
 */
export function BooksTabs({
  lang,
  labels,
  money,
  books,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  books: BooksScreen;
}) {
  const [tab, setTab] = useState<BooksTab>('exp');

  return (
    <>
      <div className="bg-bg-muted mb-5 flex w-fit flex-wrap gap-0.5 rounded-md p-[3px]">
        {BOOKS_TABS.map((key) => (
          <button
            key={key}
            type="button"
            data-seg
            data-active={tab === key ? 'true' : undefined}
            onClick={() => setTab(key)}
            className="h-8 rounded-[7px] border-0 bg-transparent px-3.5 text-sm font-medium"
          >
            {labels[`tab_${key}`]}
          </button>
        ))}
      </div>

      {tab === 'exp' ? (
        <Expenses lang={lang} labels={labels} money={money} expenses={books.expenses} />
      ) : null}
      {tab === 'debts' ? (
        <Debts
          lang={lang}
          labels={labels}
          money={money}
          payables={books.payables}
          receivables={books.receivables}
        />
      ) : null}
      {tab === 'payroll' ? (
        <Payroll lang={lang} labels={labels} money={money} payroll={books.payroll} />
      ) : null}
      {tab === 'close' ? (
        <Close lang={lang} labels={labels} money={money} periods={books.periods} />
      ) : null}
      {tab === 'assets' ? (
        <FixedAssets lang={lang} labels={labels} money={money} assets={books.assets} />
      ) : null}
      {tab === 'moves' ? (
        <MoneyMovement lang={lang} labels={labels} money={money} moves={books.moves} />
      ) : null}
      {tab === 'docs' ? <Documents lang={lang} labels={labels} /> : null}
    </>
  );
}

function Kpis({
  items,
}: {
  items: readonly { label: string; value: string; note: string; ink?: string }[];
}) {
  return (
    <div className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-surface rounded-lg border px-5 py-[18px]">
          <div className="text-fg-subtle mb-2 text-xs">{item.label}</div>
          <div
            data-num
            className={`font-display text-2xl font-semibold tracking-tight ${item.ink ?? ''}`}
          >
            {item.value}
          </div>
          <div className="text-fg-subtle mt-1.5 text-xs">{item.note}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- expenses */

function Expenses({
  lang,
  labels,
  money,
  expenses,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  expenses: BooksScreen['expenses'];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  /*
   * The chip's optimistic state, keyed by row.
   *
   * Only for the fixture and for the moment between the click and the refresh:
   * a live row's truth is `paid_at` on the server, and `router.refresh()` is
   * what settles it. Seeded from whatever was drawn rather than from `EXPENSES`
   * — seeding from the fixture meant a live row with no entry here read as paid
   * whatever the server said.
   */
  const [paid, setPaid] = useState<Record<string, boolean>>(
    Object.fromEntries(expenses.rows.map((expense) => [expense.id, expense.paid])),
  );
  const [settling, setSettling] = useState<string | null>(null);

  /**
   * Marking an invoice paid, or putting it back.
   *
   * `PATCH /finance/expenses/{id}` through this app's own route handler, which
   * is the only way a client component can reach the API: the session token is
   * in an httpOnly cookie only Node can read.
   *
   * Both directions, deliberately. A chip that only closes is a mis-click
   * somebody lives with for ever, and the row it is on is money the accountant
   * is about to report as owed.
   */
  async function togglePaid(id: string, next: boolean) {
    if (settling !== null) return;

    const expenseId = apiId(id);

    /* A fixture row — the demo book carries `e1`, `e2`. Local state is the
       whole feature on a console with no session behind it. */
    if (expenseId === null) {
      setPaid((current) => ({ ...current, [id]: next }));

      return;
    }

    setSettling(id);
    setPaid((current) => ({ ...current, [id]: next }));

    const answer = await post<unknown>(
      '/api/finance/expense-paid',
      { id: expenseId, paid: next },
      lang,
    );

    setSettling(null);

    if (!answer.ok) {
      // Put the chip back where it was. An optimistic update that survives a
      // refusal is the version of this that reports the rent as paid.
      setPaid((current) => ({ ...current, [id]: !next }));
      flash.problem(answer.message ?? labels.markedPaid);

      return;
    }

    flash(next ? labels.markedPaid : labels.markedUnpaid);
    // The KPI strip above counts the unpaid total from the server's own figure.
    router.refresh();
  }

  const rows = expenses.rows;
  const breakdown = categoryTotals(rows);
  const biggest = breakdown[0]?.amount ?? 1;

  /* Whole so'm. Separators are dropped rather than parsed: a person typing
     millions uses spaces, dots or commas depending on the keyboard, and none of
     them belong to the number. */
  const som = Number.parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;

  /* So'm on screen, tiyin on the wire — the one conversion this form does, and
     integer throughout. */
  const tiyin = som * 100;

  const complete = note.trim() !== '' && tiyin > 0;

  function closeForm() {
    setAdding(false);
    setNote('');
    setAmount('');
  }

  async function save() {
    if (busy) return;

    setBusy(true);

    const answer = await post<unknown>(
      '/api/finance/expenses',
      { category, note: note.trim(), amountTiyin: tiyin },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.expenseSaved);

      return;
    }

    // The table reads the same endpoint this just wrote to, so the row appears
    // in the next render rather than being faked into local state.
    closeForm();
    flash(labels.expenseSaved);
    router.refresh();
  }

  return (
    <>
      {/*
       * Three cards on a live console too, and both of the two that used to be
       * dropped now have something behind them.
       *
       * The budget is `targets.expense_monthly_tiyin` on the restaurant's own
       * settings document — the plan figure, which used to be a 52M so'm
       * constant in `books-data.ts` — and "unpaid" is `finance.expenses
       * .paid_at`, the column that did not exist. Where a restaurant has set no
       * budget the first card still says so and the third is dropped: a plan
       * nobody agreed to is not a plan, and `budgetTiyin` is null rather than
       * zero for exactly that reason.
       */}
      <Kpis
        items={
          expenses.live && money.budget === undefined
            ? [
                { label: labels.kpiSpent, value: money.expenseTotal!, note: labels.noBudget },
                {
                  label: labels.kpiUnpaid,
                  value: money.unpaidTotal!,
                  note: money.unpaidCount!,
                  ink: 'text-warning-700',
                },
              ]
            : [
                {
                  label: labels.kpiSpent,
                  value: money.expenseTotal!,
                  note: labels.ofBudget
                    .replace('{budget}', money.budget!)
                    .replace('{percent}', money.budgetPercent!),
                  ink: Number(money.budgetPercent) > 100 ? 'text-danger-600' : '',
                },
                {
                  label: labels.kpiUnpaid,
                  value: money.unpaidTotal!,
                  note: money.unpaidCount!,
                  ink: 'text-warning-700',
                },
                { label: labels.kpiLeft, value: money.budgetLeft!, note: labels.forMonth },
              ]
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setAdding((open) => !open)}
              className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-4 text-sm font-semibold text-white"
            >
              {labels.addExpense}
            </button>
          </div>

          {adding ? (
            <div className="bg-surface mb-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[160px]">
                  <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colCategory}</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                    className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((key) => (
                      <option key={key} value={key}>
                        {labels[`cat_${key}`]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="min-w-[200px] flex-1">
                  <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colNote}</span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                  />
                </label>

                <label className="w-36">
                  <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colAmount}</span>
                  <input
                    inputMode="numeric"
                    data-num
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-right text-sm"
                  />
                </label>

                {/*
                 * Inert until both fields are filled, which is the one place on
                 * this screen where disabling is the honest control rather than
                 * the lazy one: the two empty boxes are in the same glance as
                 * the button, so nothing needs explaining. Elsewhere — the
                 * period close — a disabled button would be answering a
                 * question the reader cannot see the answer to.
                 */}
                <button
                  type="button"
                  data-press
                  disabled={!complete || busy}
                  onClick={() => void save()}
                  className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {labels.save}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="text-fg-muted h-10 rounded-md px-3 text-sm font-medium"
                >
                  {labels.cancel}
                </button>
              </div>
            </div>
          ) : null}

          <div className="bg-surface overflow-hidden rounded-lg border">
            {/* The card clips to keep its rounded corners, so the table needs its own
                scroller — without one a phone loses the right-hand columns entirely,
                and a clipped column is worse than a scrolled one: nobody can reach it. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                    <th className="px-5 py-2.5 text-left font-semibold">{labels.colDate}</th>
                    <th className="px-3 py-2.5 text-left font-semibold">{labels.colNote}</th>
                    <th className="px-3 py-2.5 text-left font-semibold">{labels.colCategory}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{labels.colAmount}</th>
                    <th className="px-5 py-2.5 text-right font-semibold">{labels.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-fg-subtle px-5 py-8 text-center text-sm">
                        {labels.emptyExpenses}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((expense) => {
                    const isPaid = paid[expense.id] !== false;

                    return (
                      <tr key={expense.id} className="border-divider border-b last:border-0">
                        <td data-num className="text-fg-muted px-5 py-3">
                          {expense.date}
                        </td>
                        <td className="px-3 py-3 font-medium">{say(expense.note, lang)}</td>
                        <td className="text-fg-muted px-3 py-3">
                          {labels[`cat_${expense.category}`]}
                        </td>
                        <td data-num className="px-3 py-3 text-right font-semibold">
                          {money[`exp_${expense.id}`]}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {/*
                           * A real control on every row now, live or not.
                           *
                           * It used to be a label on a live table with a note
                           * saying `finance.expenses` had no paid column — which
                           * was true, and meant the design's chip could not work.
                           * The column exists, so the click writes: an invoice
                           * filed today and paid on the 20th is the ordinary case
                           * this screen is for.
                           */}
                          <button
                            type="button"
                            disabled={settling === expense.id}
                            onClick={() => void togglePaid(expense.id, !isPaid)}
                            title={isPaid ? labels.markUnpaid : labels.markPaid}
                            className={`rounded-pill text-2xs px-2.5 py-1 font-semibold disabled:opacity-50 ${
                              isPaid
                                ? 'bg-success-50 text-success-700'
                                : 'bg-warning-50 text-warning-700'
                            }`}
                          >
                            {isPaid ? labels.paid : labels.unpaid}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="bg-surface h-fit min-w-0 rounded-lg border p-5">
          <h3 className="text-md font-semibold">{labels.breakdown}</h3>

          <ul className="mt-3.5 flex flex-col gap-2.5">
            {breakdown.map((row) => (
              <li key={row.category}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{labels[`cat_${row.category}`]}</span>
                  <span data-num className="font-medium">
                    {money[`cat_${row.category}`]}
                  </span>
                </div>
                <div className="bg-bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-brand-500 h-full rounded-full"
                    style={{ width: `${Math.round((row.amount / biggest) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------- payables and AR */

function Debts({
  lang,
  labels,
  money,
  payables,
  receivables,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  payables: BooksScreen['payables'];
  /**
   * Who owes the restaurant, with an age against every row.
   *
   * This half used to be hidden on a live console and drawn from the design's
   * three debtors otherwise, because the age had no source: `GET /crm/accounts`
   * answered a balance and a balance has no date on it. It carries
   * `oldest_unsettled_at` now — the oldest charge since the tab was last clear,
   * which is what stops a regular who pays every month being reported as two
   * years overdue.
   */
  receivables: BooksScreen['receivables'];
}) {
  const router = useRouter();
  const [paying, setPaying] = useState<string | null>(null);

  /**
   * Settling a supplier invoice.
   *
   * The whole outstanding balance, because the design's control is a "pay"
   * button and not a payment form. `POST /suppliers/purchase-orders/{id}/pay`
   * with no amount means all of it, and the API works it out under a row lock:
   * a console that sent the figure it rendered a minute ago would let two
   * people pay the same invoice twice, and the second payment would be refused
   * as an overpayment rather than recognised as a duplicate.
   *
   * `router.refresh()` rather than a local strike-through. The write moves
   * three things — `paid_amount`, `paid_at` and the supplier's own debt — and
   * a row that says paid while the total above it still counts the money is
   * exactly the disagreement this replaces. Settled invoices are not in the
   * list at all (see `payablesFrom`), so the row leaves and the KPIs drop
   * together, in one render, from one source.
   */
  async function pay(row: BooksScreen['payables']['rows'][number]) {
    if (paying === row.id) return;

    const orderId = apiId(row.id);

    /* A fixture invoice — the demo book carries `a1`, `a2`. The toast is the
       whole feature on a console with no session behind it. */
    if (orderId === null) {
      flash(`${row.document} · ${labels.markedPaid}`);

      return;
    }

    setPaying(row.id);

    const answer = await post<unknown>('/api/suppliers/invoice-pay', { id: orderId }, lang);

    setPaying(null);

    if (!answer.ok) {
      flash.problem(answer.message ?? `${row.document} · ${labels.markedPaid}`);

      return;
    }

    flash(`${row.document} · ${labels.markedPaid}`);
    router.refresh();
  }

  /**
   * A guest paying off their tab.
   *
   * The whole balance, because the design's control is a "receive" button and
   * not a payment form. The ceiling is the API's to enforce and it does so
   * under a lock — a client checking the balance it rendered a minute ago would
   * let two people settle the same debt twice.
   *
   * `router.refresh()` on success rather than a local strike-through: settling
   * moves the balance, the ageing bucket the guest sits in and the total above
   * the table, and a row that says "received" beside a header that still counts
   * the money is the disagreement somebody screenshots.
   */
  async function settle(row: Receivable) {
    const customerId = apiId(row.id);

    /* A fixture guest — the demo book carries `r1`, `r2`. The toast is the
       whole feature on a console with no session behind it. */
    if (customerId === null) {
      flash(labels.debtReceived);

      return;
    }

    const answer = await post<unknown>(
      '/api/finance/debt-settlement',
      { customerId, amountTiyin: row.amount },
      lang,
    );

    if (answer.ok) {
      flash(labels.debtReceived);
      router.refresh();

      return;
    }

    flash.problem(answer.message ?? labels.debtReceived);
  }

  return (
    <>
      <Kpis
        items={[
          {
            label: labels.kpiPayable,
            value: money.payableTotal!,
            note: labels.suppliers.replace('{n}', String(payables.rows.length)),
          },
          {
            label: labels.overdue,
            value: money.overdueTotal!,
            note: money.overdueCount!,
            ink: 'text-danger-600',
          },
          {
            label: labels.dueSoon,
            value: money.dueSoonTotal!,
            note: labels.toPay,
            ink: 'text-warning-700',
          },
        ]}
      />

      <section className="mb-6">
        <h3 className="text-md mb-1 font-semibold">{labels.payableTitle}</h3>
        <p className="text-fg-muted mb-3 text-sm">{labels.payableSub}</p>

        <div className="bg-surface overflow-hidden rounded-lg border">
          {/* The card clips to keep its rounded corners, so the table needs its own
              scroller — without one a phone loses the right-hand columns entirely,
              and a clipped column is worse than a scrolled one: nobody can reach it. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">{labels.colSupplier}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{labels.colDocument}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{labels.colDue}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{labels.colBalance}</th>
                  <th className="px-5 py-2.5 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {payables.rows.map((row) => {
                  const late = row.dueInDays < 0;

                  return (
                    <tr key={row.id} className="border-divider border-b last:border-0">
                      <td className="px-5 py-3">
                        <span className="font-medium">{row.supplier}</span>
                        <span className="text-fg-subtle block text-xs">{say(row.what, lang)}</span>
                      </td>
                      <td data-num className="text-fg-muted px-3 py-3">
                        {row.document}
                      </td>
                      <td
                        data-num
                        className={`px-3 py-3 text-right ${
                          late
                            ? 'text-danger-600 font-semibold'
                            : row.dueInDays <= 5
                              ? 'text-warning-700'
                              : 'text-fg-muted'
                        }`}
                      >
                        {late
                          ? labels.daysLate.replace('{n}', String(Math.abs(row.dueInDays)))
                          : labels.daysLeft.replace('{n}', String(row.dueInDays))}
                      </td>
                      <td data-num className="px-3 py-3 text-right font-semibold">
                        {money[`ap_${row.id}`]}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {/*
                         * Inert only while its own request is in flight, and per
                         * row rather than for the table: a manager settling five
                         * invoices in a row should not have the other four go
                         * dead because the first one is still travelling.
                         */}
                        <button
                          type="button"
                          data-press
                          disabled={paying === row.id}
                          onClick={() => void pay(row)}
                          className="bg-brand-500 hover:bg-brand-600 h-8 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {labels.pay}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-md mb-1 font-semibold">{labels.receivableTitle}</h3>
        <p className="text-fg-muted mb-3 text-sm">{labels.receivableSub}</p>

        {/* Ageing first: which bucket the money is in decides what to do about it. */}
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          {AGEING.map((bucket, index) => {
            const total = bucketTotal(receivables.rows, bucket.from, bucket.to);
            const hot = index >= 2 && total > 0;

            return (
              <div
                key={bucket.key}
                className={`rounded-md border px-3.5 py-3 ${
                  hot
                    ? 'border-danger-500/30 bg-danger-50'
                    : total > 0
                      ? 'border-warning-500/30 bg-warning-50'
                      : 'bg-bg-subtle'
                }`}
              >
                <div className="text-fg-subtle text-2xs">{labels[`age_${bucket.key}`]}</div>
                <div
                  data-num
                  className={`mt-1 font-semibold ${
                    hot ? 'text-danger-700' : total > 0 ? 'text-warning-700' : 'text-fg-subtle'
                  }`}
                >
                  {total > 0 ? money[`age_${bucket.key}`] : '—'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-surface overflow-hidden rounded-lg border">
          {/* The card clips to keep its rounded corners, so the table needs its own
              scroller — without one a phone loses the right-hand columns entirely,
              and a clipped column is worse than a scrolled one: nobody can reach it. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                  <th className="px-5 py-2.5 text-left font-semibold">{labels.colCustomer}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{labels.colPhone}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{labels.colAge}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{labels.colOwed}</th>
                  <th className="px-5 py-2.5 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {receivables.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-fg-subtle px-5 py-8 text-center text-sm">
                      {labels.emptyReceivables}
                    </td>
                  </tr>
                ) : null}
                {receivables.rows.map((row) => (
                  <tr key={row.id} className="border-divider border-b last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium">{row.customer}</span>
                      <span className="text-fg-subtle block text-xs">
                        {row.limit === null
                          ? labels.noLimit
                          : labels.limit.replace('{amount}', money[`limit_${row.id}`] ?? '')}
                      </span>
                    </td>
                    <td data-num className="text-fg-muted px-3 py-3">
                      {row.phone}
                    </td>
                    <td
                      data-num
                      className={`px-3 py-3 text-right ${row.ageDays > 30 ? 'text-danger-600 font-semibold' : 'text-warning-700'}`}
                    >
                      {labels.days.replace('{n}', String(row.ageDays))}
                    </td>
                    <td data-num className="px-3 py-3 text-right font-semibold">
                      {money[`ar_${row.id}`]}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {/* `POST /crm/customers/{id}/account/settlement` — CRM owns
                        the guest account; this screen only reads it. */}
                      <button
                        type="button"
                        data-press
                        onClick={() => void settle(row)}
                        className="border-border-strong hover:bg-bg-muted h-8 rounded-md border px-3 text-xs font-semibold"
                      >
                        {labels.receive}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/*
         * The sentence that stops a month being counted twice. Settling a debt
         * is a receipt; the sale was booked the day the ticket closed.
         */}
        <p className="text-fg-muted mt-3 text-xs leading-normal">{labels.receivableNote}</p>
      </section>
    </>
  );
}

/* --------------------------------------------------------------- payroll */

function Payroll({
  lang,
  labels,
  money,
  payroll,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  payroll: BooksScreen['payroll'];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /**
   * Freezing the month's wages.
   *
   * `POST /staff/payroll/{id}/finalize` re-sums the three totals inside the
   * same transaction as the signature and then stops accepting edits. The
   * button is drawn whatever the run's state, because a control that appears
   * and disappears with a state the reader cannot see is worse than one that
   * explains itself — and the API's own refusals are the explanation:
   * `staff.payroll_finalised` for a run already signed,
   * `staff.payroll_empty` for a month nobody worked, which in a restaurant
   * means the run was built against the wrong branch.
   */
  async function finalise() {
    if (busy) return;

    /* No live run means the table above is the fixture, so there is nothing to
       freeze and nothing to refuse — the same demo behaviour every other
       button on this screen falls back to. */
    if (payroll.runId === null) {
      flash(labels.payrollFinalised);

      return;
    }

    setBusy(true);

    const answer = await post<unknown>('/api/staff/payroll-finalize', { id: payroll.runId }, lang);

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.payrollFinalised);

      return;
    }

    flash(labels.payrollFinalised);
    router.refresh();
  }

  return (
    <>
      {/*
       * One card on a live run, three on the demo.
       *
       * The three read fund, advance paid and remaining; a run answers gross,
       * deductions and net. An advance is money already handed over and a
       * deduction is money held back — different figures — so the other two
       * used to print `PAYROLL_FUND` and `ADVANCE_PAID`: a 128M so'm wage fund
       * and a 51M advance, over a live payslip table, for a restaurant with no
       * staff. The fund is summed from the rows below, so the card and the
       * table cannot disagree.
       */}
      <Kpis
        items={
          payroll.live
            ? [{ label: labels.kpiFund, value: money.payrollFund!, note: money.payrollNote! }]
            : [
                { label: labels.kpiFund, value: money.payrollFund!, note: money.payrollNote! },
                {
                  label: labels.kpiAdvance,
                  value: money.advancePaid!,
                  note: labels.advanceNote,
                  ink: 'text-success-600',
                },
                {
                  label: labels.kpiRemaining,
                  value: money.payrollRemaining!,
                  note: labels.remainingNote,
                  ink: 'text-warning-700',
                },
              ]
        }
      />

      <div className="bg-surface overflow-hidden rounded-lg border">
        {/* The card clips to keep its rounded corners, so the table needs its own
            scroller — without one a phone loses the right-hand columns entirely,
            and a clipped column is worse than a scrolled one: nobody can reach it. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">{labels.colStaff}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colBase}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colBonus}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colDeductions}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{labels.colNet}</th>
              </tr>
            </thead>
            <tbody>
              {payroll.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-fg-subtle px-5 py-8 text-center text-sm">
                    {labels.emptyPayroll}
                  </td>
                </tr>
              ) : null}
              {payroll.rows.map((row) => (
                <tr key={row.id} className="border-divider border-b last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-fg-subtle block text-xs">
                      {labels[`role_${row.role}`]}
                    </span>
                  </td>
                  <td data-num className="text-fg-muted px-3 py-3 text-right">
                    {money[`base_${row.id}`]}
                  </td>
                  <td data-num className="text-success-600 px-3 py-3 text-right">
                    +{money[`bonus_${row.id}`]}
                  </td>
                  <td data-num className="text-danger-600 px-3 py-3 text-right">
                    −{money[`hold_${row.id}`]}
                  </td>
                  <td data-num className="px-5 py-3 text-right font-semibold">
                    {money[`net_${row.id}`]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
       * The bank file is still missing and is not an endpoint away: the toast
       * says the payment list went to the bank, and what actually happened is
       * that the run stopped accepting edits. A bank's upload format is a
       * contract with one bank rather than a schema, so it lands the day a
       * restaurant names theirs.
       */}
      <button
        type="button"
        data-press
        disabled={busy}
        onClick={() => void finalise()}
        className="bg-brand-500 hover:bg-brand-600 mt-4 h-10 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {labels.finalise}
      </button>
    </>
  );
}

/* ---------------------------------------------------------- period close */

function Close({
  lang,
  labels,
  money,
  periods,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  periods: BooksScreen['periods'];
}) {
  const router = useRouter();
  const balanced = reconciles();
  const [closing, setClosing] = useState<string | null>(null);

  /**
   * Locking a month.
   *
   * `POST /finance/periods/{YYYY-MM}/close` addressed by month rather than by
   * id, which is what makes the panel work at all: half these rows have no
   * database row behind them yet — a month nobody has touched is still a real,
   * closable month — so there is no id to send for the first close a
   * restaurant ever performs.
   *
   * The reconciliation check beside this is the console's, and the API keeps
   * its own: the running month is refused upstream as
   * `finance.period_still_running` whether or not a screen drew the button.
   * The two are not redundant — a screen decides what a person can press, an
   * API decides what can happen, and the offline queue and a second console
   * both reach this without passing through here.
   */
  async function close(key: string) {
    if (closing !== null) return;

    /* A fixture month — the demo book keys them `may`, `jun`. The endpoint's
       path is `YYYY-MM` and the route refuses anything else, so this is the
       same guard `apiId()` performs for a numeric id. */
    if (!/^\d{4}-\d{2}$/.test(key)) {
      flash(labels.periodClosed);

      return;
    }

    setClosing(key);

    const answer = await post<unknown>('/api/finance/period-close', { period: key }, lang);

    setClosing(null);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.periodClosed);

      return;
    }

    flash(labels.periodClosed);
    router.refresh();
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="bg-surface rounded-lg border p-5">
        <h3 className="text-md font-semibold">{labels.closeTitle}</h3>
        <p className="text-fg-subtle mt-1 text-xs leading-normal">{labels.closeSub}</p>

        <ul className="mt-4 flex flex-col gap-2">
          {periods.rows.length === 0 ? (
            <li className="text-fg-subtle py-6 text-center text-sm">{labels.emptyPeriods}</li>
          ) : null}
          {periods.rows.map((period) => (
            <li
              key={period.key}
              className={`flex items-center gap-3 rounded-md border px-3.5 py-3 ${
                period.closed ? 'bg-bg-muted' : 'bg-warning-50 border-warning-500/30'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{say(period.month, lang)}</span>
                <span data-num className="text-fg-subtle block text-xs">
                  {money[`period_${period.key}`]}
                  {period.current ? ` · ${labels.inProgress}` : ''}
                </span>
              </span>

              <span
                className={`rounded-pill text-2xs px-2.5 py-1 font-semibold ${
                  period.closed ? 'text-fg-muted' : 'text-warning-700'
                }`}
              >
                {period.closed ? labels.closed : labels.open}
              </span>

              {/*
               * A running month cannot be closed and the button is not drawn
               * for it — a disabled control invites the click and then explains,
               * which is a worse way to say "not yet".
               *
               * What the lock is worth is decided elsewhere: `PeriodLock` is
               * consulted by the money writes, so backdating an invoice into a
               * closed month is refused rather than discouraged. A close button
               * without that would be a control that changes a label.
               */}
              {!period.closed && !period.current ? (
                <button
                  type="button"
                  data-press
                  disabled={!balanced || closing !== null}
                  onClick={() => void close(period.key)}
                  className="bg-brand-500 hover:bg-brand-600 h-8 flex-none rounded-md px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {labels.closeButton}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {!balanced ? (
          <p className="text-warning-700 mt-3 text-xs leading-normal">{labels.blockedByRecon}</p>
        ) : null}
      </section>

      <section className="bg-surface rounded-lg border p-5">
        <h3 className="text-md font-semibold">{labels.reconTitle}</h3>
        <p className="text-fg-subtle mt-1 text-xs leading-normal">{labels.reconSub}</p>

        <ul className="mt-4 flex flex-col gap-2.5">
          {RECONCILIATION.map((row) => {
            const difference = delta(row);

            return (
              <li
                key={row.key}
                className="border-divider flex items-center gap-3 border-b pb-2.5 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{labels[`recon_${row.key}`]}</span>
                  <span data-num className="text-fg-subtle block text-xs">
                    {labels.systemIs.replace('{amount}', money[`sys_${row.key}`] ?? '')} ·{' '}
                    {labels.actualIs.replace('{amount}', money[`real_${row.key}`] ?? '')}
                  </span>
                </span>

                <span
                  data-num
                  className={`flex-none text-sm font-semibold ${
                    difference === 0 ? 'text-success-600' : 'text-danger-600'
                  }`}
                >
                  {difference === 0
                    ? labels.matched
                    : `${difference > 0 ? '+' : '−'}${money[`diff_${row.key}`]}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- documents */

/**
 * The three printable documents the ledger produces, alongside the filings.
 *
 * `(documents)` holds the paper; this is the door to it. An accountant reading
 * this tab is already looking at what the month owes and what it earned, which
 * is the moment they want the invoice, the payslip or the P&L in their hand.
 */
const LEDGER_PAPER: readonly DocumentName[] = ['invoice', 'payslip', 'profit-loss'];

function Documents({ lang, labels }: { lang: Lang; labels: Record<string, string> }) {
  const STATE_STYLE: Record<string, string> = {
    pending: 'bg-warning-50 text-warning-700',
    ready: 'bg-success-50 text-success-700',
    sent: 'bg-bg-muted text-fg-subtle',
    signed: 'bg-brand-50 text-brand-700',
  };

  return (
    <>
      <p className="text-fg-muted mb-4 text-sm">{labels.docsSub}</p>

      <div className="mb-4 flex flex-wrap gap-2.5">
        {LEDGER_PAPER.map((key) => (
          <Link
            key={key}
            href={documentHref(key)}
            data-press
            className="border-border-strong bg-surface hover:bg-bg-muted grid h-9 place-items-center rounded-md border px-3.5 text-sm font-semibold"
          >
            {printLink(key, lang)}
          </Link>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {FILINGS.map((filing) => (
          <li key={filing.key} className="bg-surface rounded-lg border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-md font-semibold">{say(filing.name, lang)}</h3>
                  <span
                    className={`rounded-pill text-2xs px-2.5 py-1 font-semibold ${STATE_STYLE[filing.state]}`}
                  >
                    {labels[`state_${filing.state}`]}
                  </span>
                </div>
                <p className="text-fg-muted mt-1.5 text-sm leading-normal">
                  {say(filing.detail, lang)}
                </p>
              </div>

              {/*
               * No button. It flashed "Hujjat yuborildi" — document sent — and
               * nothing was sent: e-filing leaves the building through Didox
               * and there is no endpoint on this platform, nor a provider
               * credential to call one with (`docs/GO-LIVE.md`). Telling an
               * accountant a tax filing went is the worst available lie on this
               * screen, so the control is gone until the integration lands.
               */}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* --------------------------------------------------------- fixed assets */

/**
 * The four kinds `FixedAsset::CATEGORIES` accepts, and their words.
 *
 * The words live here rather than in the console catalogue because they are not
 * this screen's vocabulary — they are the API's enum, and a manager picking one
 * is choosing a value the validator will check, not a label. They are also the
 * four the method note beside the table already names in prose ("fit-out 10
 * years, kitchen equipment 5, furniture 5, POS and IT 3, vehicles 5"), so the
 * list and the rule agree by construction.
 *
 * Not in `books-data.ts`: that file is the fixture and its `FixedAsset` has no
 * category at all — the design's table draws a name and a place, not a kind.
 */
type AssetCategory = 'equipment' | 'furniture' | 'fit_out' | 'vehicle';

const ASSET_CATEGORIES: readonly AssetCategory[] = ['equipment', 'furniture', 'fit_out', 'vehicle'];

const ASSET_CATEGORY_WORDS: Readonly<Record<AssetCategory, Trilingual>> = {
  equipment: { uz: 'Jihoz', ru: 'Оборудование', en: 'Equipment' },
  furniture: { uz: 'Mebel', ru: 'Мебель', en: 'Furniture' },
  fit_out: { uz: "Bino ta'miri", ru: 'Ремонт помещения', en: 'Fit-out' },
  vehicle: { uz: 'Transport', ru: 'Транспорт', en: 'Vehicle' },
};

/**
 * The register, its four figures, and the two notes beside it.
 *
 * The rail in the accumulated column is the whole table in one glance: a bar
 * near full is an asset about to stop charging, which is a replacement to
 * budget for rather than a saving to enjoy. Grey once it is at 100%, because a
 * finished asset is not an alarm — it is a fact.
 */
function FixedAssets({
  lang,
  labels,
  money,
  assets,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  assets: BooksScreen['assets'];
}) {
  const router = useRouter();
  const rows = assets.rows;

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('equipment');
  const [bought, setBought] = useState('');
  const [cost, setCost] = useState('');
  const [life, setLife] = useState('');
  const [busy, setBusy] = useState(false);

  const total = rows.reduce((sum, asset) => sum + asset.cost, 0);
  const written = rows.reduce((sum, asset) => sum + accumulated(asset), 0);
  const finished = rows.filter((asset) => !stillCharging(asset));

  /* Eighty percent of its life is the design's threshold for "soon". It is a
     fraction rather than a month count because three months left on a POS
     terminal and three months left on a fit-out are not the same news. */
  const soon = rows.filter((asset) => asset.used / asset.life >= 0.8);

  /* So'm on screen, tiyin on the wire, and integer throughout — the same one
     conversion the expense form makes, with separators dropped rather than
     parsed because a person typing millions uses spaces, dots or commas
     depending on which keyboard they are holding. */
  const costTiyin = (Number.parseInt(cost.replace(/[^0-9]/g, ''), 10) || 0) * 100;

  /* Years in, months out. The API stores `useful_life_months` and the table
     above prints years, so the form takes the unit the reader is looking at —
     a five-year fit-out typed into a months box becomes five months, and a
     fit-out written off in five months is a P&L nobody queries until the audit. */
  const years = Number.parseInt(life.replace(/[^0-9]/g, ''), 10) || 0;
  const months = years * 12;

  const complete =
    name.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(bought) && costTiyin > 0 && months > 0;

  function closeForm() {
    setAdding(false);
    setName('');
    setCost('');
    setLife('');
    setBought('');
  }

  /**
   * Putting something on the register.
   *
   * The four fields are the four the arithmetic needs — what it is, when it was
   * bought, what it cost and how long it lasts — and nothing else, because
   * everything else on this table is derived. Residual value is not asked for:
   * the method note beside the table says straight-line down to zero, and a
   * field that contradicts the rule printed next to it is how two accountants
   * end up with two registers.
   *
   * `router.refresh()` on success, because the row changes four figures above
   * it as well as its own line — cost, accumulated, book value and the monthly
   * charge that lands in the P&L — and a register whose totals lag its rows is
   * the disagreement this tab exists to prevent.
   */
  async function save() {
    if (busy) return;

    setBusy(true);

    const answer = await post<unknown>(
      '/api/finance/fixed-asset',
      {
        name: name.trim(),
        category,
        acquiredOn: bought,
        costTiyin,
        usefulLifeMonths: months,
      },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? say(LEDGER_COPY.faAdd, lang));

      return;
    }

    /* The catalogue has no confirmation sentence for this act and inventing one
       here would put copy in a component. The row itself is the confirmation —
       `router.refresh()` draws it — so the toast names what now exists. */
    flash(`${name.trim()} · ${say(LEDGER_COPY.faAdd, lang)}`);
    closeForm();
    router.refresh();
  }

  return (
    <>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        <AssetKpi
          label={say(LEDGER_COPY.faKpiCost, lang)}
          value={money.faCost ?? ''}
          note={`${rows.length} ${say(LEDGER_COPY.faKpiAssets, lang)}`}
        />
        <AssetKpi
          label={say(LEDGER_COPY.faKpiBook, lang)}
          value={money.faBook ?? ''}
          /* Guarded against an empty register, which a fixture list can never
             be and a live one is on the day a restaurant opens: nothing owned
             yet divides zero by zero and prints `NaN%` on a KPI. */
          note={`${total === 0 ? 0 : Math.round(((total - written) / total) * 100)}% ${say(LEDGER_COPY.faKpiRemaining, lang)}`}
        />
        <AssetKpi
          label={say(LEDGER_COPY.faKpiMonthly, lang)}
          value={money.faMonthly ?? ''}
          note={say(LEDGER_COPY.faKpiExpensed, lang)}
        />
        <AssetKpi
          label={say(LEDGER_COPY.faKpiDone, lang)}
          value={String(finished.length)}
          note={say(LEDGER_COPY.faKpiAwaiting, lang)}
        />
      </div>

      <section className="bg-surface mt-4 overflow-hidden rounded-lg border">
        <div className="border-divider flex flex-wrap items-end justify-between gap-5 border-b px-[22px] py-[18px]">
          <div>
            <div className="text-sm font-semibold">{say(LEDGER_COPY.faRegister, lang)}</div>
            <p className="text-fg-subtle mt-1.5 text-xs">{say(LEDGER_COPY.faRegisterSub, lang)}</p>
          </div>

          {/*
           * The design's own handler was `flash("Add asset form")` — a
           * placeholder naming the thing that had to exist. This is that form,
           * built in the disclosure pattern the expenses tab on this same
           * screen already establishes, so the two read as one console rather
           * than two.
           */}
          <button
            type="button"
            data-press
            onClick={() => setAdding((open) => !open)}
            className="bg-surface border-border-strong hover:bg-bg-muted h-[34px] flex-none rounded-md border px-3.5 text-sm font-semibold"
          >
            {say(LEDGER_COPY.faAdd, lang)}
          </button>
        </div>

        {adding ? (
          <div className="border-divider border-b px-[22px] py-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[200px] flex-1">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.faName, lang)}
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                />
              </label>

              <label className="min-w-[160px]">
                <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colCategory}</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as AssetCategory)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                >
                  {ASSET_CATEGORIES.map((key) => (
                    <option key={key} value={key}>
                      {say(ASSET_CATEGORY_WORDS[key], lang)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="w-40">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.faBought, lang)}
                </span>
                {/* A date input rather than the table's `DD.MM.YYYY`: the API
                    wants `YYYY-MM-DD`, and a typed date is the field people get
                    wrong in whichever order their country writes it. */}
                <input
                  type="date"
                  value={bought}
                  onChange={(event) => setBought(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                />
              </label>

              <label className="w-36">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.faCost, lang)}
                </span>
                <input
                  inputMode="numeric"
                  data-num
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-right text-sm"
                />
              </label>

              <label className="w-28">
                {/* The unit is in the label rather than a hint under the row:
                    it is the one box on this form whose meaning changes the
                    answer by a factor of twelve. */}
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.faLife, lang)} · {say(LEDGER_COPY.years, lang)}
                </span>
                <input
                  inputMode="numeric"
                  data-num
                  value={life}
                  onChange={(event) => setLife(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-right text-sm"
                />
              </label>

              <button
                type="button"
                data-press
                disabled={!complete || busy}
                onClick={() => void save()}
                className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {labels.save}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="text-fg-muted h-10 rounded-md px-3 text-sm font-medium"
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        ) : null}

        <div data-scroll className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-bg-subtle">
                <Th className="px-[22px] text-left">{say(LEDGER_COPY.faName, lang)}</Th>
                <Th className="text-left">{say(LEDGER_COPY.faBought, lang)}</Th>
                <Th className="text-right">{say(LEDGER_COPY.faCost, lang)}</Th>
                <Th className="text-right">{say(LEDGER_COPY.faLife, lang)}</Th>
                <Th className="text-right">{say(LEDGER_COPY.faMonthly, lang)}</Th>
                <Th className="text-right">{say(LEDGER_COPY.faAccum, lang)}</Th>
                <Th className="px-[22px] text-right">{say(LEDGER_COPY.faBook, lang)}</Th>
              </tr>
            </thead>

            <tbody>
              {rows.map((asset, index) => {
                const percent = Math.round((accumulated(asset) / asset.cost) * 100);
                const fill =
                  percent >= 100
                    ? 'var(--n-300)'
                    : percent > 75
                      ? 'var(--warning-500)'
                      : 'var(--brand-500)';

                return (
                  /* Keyed by position, not by date and name: two assets bought
                     on the same day with the same name is what a fit-out of two
                     identical branches looks like, and a shared key hands the
                     second row the first one's figures. */
                  <tr key={index} data-row className="border-divider border-b">
                    <td className="px-[22px] py-3.5">
                      <div className="text-sm font-semibold">{say(asset.name, lang)}</div>
                      <div className="text-fg-subtle mt-[3px] text-xs">
                        {say(asset.where, lang)}
                      </div>
                    </td>
                    <td data-num className="text-fg-muted px-3.5 py-3.5 text-sm whitespace-nowrap">
                      {asset.date}
                    </td>
                    <td data-num className="px-3.5 py-3.5 text-right text-sm whitespace-nowrap">
                      {money[`faAssetCost_${index}`] ?? ''}
                    </td>
                    <td
                      data-num
                      className="text-fg-muted px-3.5 py-3.5 text-right text-sm whitespace-nowrap"
                    >
                      {asset.life / 12} {say(LEDGER_COPY.years, lang)}
                    </td>
                    <td
                      data-num
                      className="text-fg-muted px-3.5 py-3.5 text-right text-sm whitespace-nowrap"
                    >
                      {stillCharging(asset) ? (money[`faAssetMonthly_${index}`] ?? '') : '—'}
                    </td>
                    <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                      <div data-num className="text-fg-muted text-sm">
                        {money[`faAssetAccum_${index}`] ?? ''}
                      </div>
                      <div className="bg-bg-muted mt-1.5 ml-auto h-[3px] w-[74px] overflow-hidden rounded-[2px]">
                        <div
                          className="h-full rounded-[2px]"
                          style={{ width: `${Math.min(100, percent)}%`, background: fill }}
                        />
                      </div>
                    </td>
                    <td
                      data-num
                      className={`px-[22px] py-3.5 text-right text-sm font-semibold whitespace-nowrap ${
                        bookValue(asset) === 0 ? 'text-fg-subtle' : ''
                      }`}
                    >
                      {money[`faAssetBook_${index}`] ?? ''}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-bg-subtle">
                <td colSpan={2} className="px-[22px] py-3.5 text-sm font-semibold">
                  {say(LEDGER_COPY.faTotal, lang)}
                </td>
                <td data-num className="px-3.5 py-3.5 text-right text-sm font-semibold">
                  {money.faCost ?? ''}
                </td>
                <td />
                <td data-num className="px-3.5 py-3.5 text-right text-sm font-semibold">
                  {money.faMonthly ?? ''}
                </td>
                <td data-num className="px-3.5 py-3.5 text-right text-sm font-semibold">
                  {money.faAccum ?? ''}
                </td>
                <td data-num className="px-[22px] py-3.5 text-right text-sm font-bold">
                  {money.faBook ?? ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="bg-surface rounded-lg border px-[22px] py-5">
          <div className="text-sm font-semibold">{say(LEDGER_COPY.faSoon, lang)}</div>
          <p className="text-fg-subtle mt-1.5 text-xs">{say(LEDGER_COPY.faSoonSub, lang)}</p>

          <div className="mt-3.5 flex flex-col">
            {soon.map((asset, index) => {
              const done = !stillCharging(asset);

              return (
                <div key={index} className="border-divider flex items-center gap-3.5 border-b py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{say(asset.name, lang)}</div>
                    <div className="text-fg-subtle mt-[3px] text-xs">
                      {done
                        ? say(LEDGER_COPY.faDoneWhy, lang)
                        : `${Math.max(1, asset.life - asset.used)} ${say(LEDGER_COPY.faMonthsLeft, lang)}`}
                    </div>
                  </div>

                  <span
                    data-num
                    className={`rounded-pill flex-none px-2.5 py-1 text-xs font-semibold ${
                      done ? 'bg-danger-50 text-danger-600' : 'bg-warning-50 text-warning-600'
                    }`}
                  >
                    {done
                      ? say(LEDGER_COPY.faDone, lang)
                      : `${Math.round((asset.used / asset.life) * 100)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-surface rounded-lg border px-[22px] py-5">
          <div className="text-sm font-semibold">{say(LEDGER_COPY.faMethod, lang)}</div>
          <div className="mt-3.5 flex flex-col gap-3">
            {DEPRECIATION_NOTES.map((note) => (
              <div key={note.en} className="flex items-start gap-2.5">
                <span className="bg-fg-subtle mt-[7px] size-1.5 flex-none rounded-full" />
                <span className="text-fg-muted text-sm leading-normal">{say(note, lang)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function AssetKpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-surface rounded-lg border p-5">
      <div className="text-fg-subtle text-xs">{label}</div>
      <div data-num className="font-display mt-2.5 text-3xl font-bold tracking-tight">
        {value}
      </div>
      <div data-num className="text-fg-subtle mt-[7px] text-xs">
        {note}
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-divider text-fg-subtle border-b px-3.5 py-[11px] text-xs font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

/* ------------------------------------------------------- money movement */

const MOVE_COLUMNS = '[grid-template-columns:112px_minmax(160px,1.4fr)_130px_118px_130px_120px]';

/** Cash in, cash out, and where the balance stood after each line. */
function MoneyMovement({
  lang,
  labels,
  money,
  moves,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  moves: BooksScreen['moves'];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');

  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  /* Filtering only hides rows; the balance column keeps the figure the ledger
     actually stood at, which is why it is looked up by row and not recomputed
     from whatever survived the filter. The original position is carried through
     the filter for the same reason — it is the key both figures are stored
     under. */
  const rows = moves.rows
    .map((move, index) => ({ move, index }))
    .filter(
      ({ move }) => filter === 'all' || (filter === 'in' ? move.amount > 0 : move.amount < 0),
    );

  const tiyin = (Number.parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0) * 100;
  const transferable = moves.accounts.length >= 2;
  const complete = from !== '' && to !== '' && from !== to && tiyin > 0 && reason.trim() !== '';

  function closeForm() {
    setAdding(false);
    setAmount('');
    setReason('');
  }

  /**
   * Moving money from one place to another.
   *
   * Two accounts, never a till. A till end needs a shift id, and the console
   * does not know which shift is open at which terminal — the till's own screen
   * does, which is why the drop button lives there. What this form covers is
   * the leg the till cannot write: safe to bank, bank to a branch, one account
   * to another.
   *
   * The API writes both legs in one transaction and points them at each other.
   * That pairing is the entire reason this is not `POST /pos/drawer/movements`
   * twice: a ledger that booked the leaving without the arriving shows a loss
   * on a day that made money, which is the sentence printed under this table.
   */
  async function send() {
    if (busy) return;

    setBusy(true);

    const answer = await post<unknown>(
      '/api/finance/cash-transfer',
      {
        fromAccountId: Number(from),
        toAccountId: Number(to),
        amountTiyin: tiyin,
        reason: reason.trim(),
      },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? say(LEDGER_COPY.mvAdd, lang));

      return;
    }

    /* Named after what moved rather than a sentence: the catalogue has no
       confirmation for a cash transfer, and the two new rows that appear on
       `router.refresh()` are the real answer. */
    flash(`${reason.trim()} · ${say(LEDGER_COPY.mvAdd, lang)}`);
    closeForm();
    router.refresh();
  }

  const filters = [
    { key: 'all' as const, label: say(LEDGER_COPY.mvAll, lang), dot: 'var(--n-400)' },
    { key: 'in' as const, label: say(LEDGER_COPY.mvIn, lang), dot: 'var(--success-500)' },
    { key: 'out' as const, label: say(LEDGER_COPY.mvOut, lang), dot: 'var(--danger-500)' },
  ];

  return (
    <>
      <div className="mb-[18px] grid [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        <MoveKpi
          label={say(LEDGER_COPY.mvKpiIn, lang)}
          value={money.mvIn ?? ''}
          note={say(LEDGER_COPY.mvKpiInNote, lang)}
          ink="text-success-600"
        />
        <MoveKpi
          label={say(LEDGER_COPY.mvKpiOut, lang)}
          value={money.mvOut ?? ''}
          note={say(LEDGER_COPY.mvKpiOutNote, lang)}
          ink="text-danger-600"
        />
        <MoveKpi
          label={say(LEDGER_COPY.mvKpiNet, lang)}
          value={money.mvNet ?? ''}
          note={say(LEDGER_COPY.mvKpiNetNote, lang)}
          ink={money.mvNetPositive === 'true' ? 'text-success-600' : 'text-danger-600'}
        />
        <MoveKpi
          label={say(LEDGER_COPY.mvKpiBalance, lang)}
          value={money.mvBalance ?? ''}
          note={say(LEDGER_COPY.mvKpiBalanceNote, lang)}
        />
      </div>

      <section className="bg-surface overflow-hidden rounded-lg border">
        <div className="border-divider flex flex-wrap items-center justify-between gap-4 border-b px-[22px] py-4">
          <div className="flex gap-[7px]">
            {filters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                data-press
                onClick={() => setFilter(entry.key)}
                className={`rounded-pill flex h-8 items-center gap-[7px] border px-3 text-xs font-semibold ${
                  filter === entry.key
                    ? 'bg-bg-muted border-border-strong text-fg'
                    : 'bg-surface text-fg-muted'
                }`}
              >
                <span className="size-[7px] rounded-full" style={{ background: entry.dot }} />
                {entry.label}
              </button>
            ))}
          </div>

          {/*
           * The form opens only where there is somewhere to move money to. A
           * console with fewer than two cash accounts — the fixture one, and a
           * live one on the day a restaurant is set up — would otherwise get a
           * form with two empty selects, and a control that cannot be completed
           * is a worse answer than the hint the design shipped with.
           */}
          <button
            type="button"
            data-press
            onClick={() =>
              transferable ? setAdding((open) => !open) : flash(say(LEDGER_COPY.mvAddHint, lang))
            }
            className="bg-brand-500 hover:bg-brand-600 h-[34px] rounded-md px-3.5 text-sm font-semibold text-white"
          >
            {say(LEDGER_COPY.mvAdd, lang)}
          </button>
        </div>

        {adding && transferable ? (
          <div className="border-divider border-b px-[22px] py-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[170px] flex-1">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.mvAccount, lang)} · {say(LEDGER_COPY.mvOut, lang)}
                </span>
                <select
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">—</option>
                  {moves.accounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="min-w-[170px] flex-1">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.mvAccount, lang)} · {say(LEDGER_COPY.mvIn, lang)}
                </span>
                <select
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">—</option>
                  {moves.accounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="w-36">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.mvAmount, lang)}
                </span>
                <input
                  inputMode="numeric"
                  data-num
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-right text-sm"
                />
              </label>

              <label className="min-w-[200px] flex-1">
                {/* Required by the API, and rightly: a movement with no reason
                    is the row nobody can explain at the month's reconciliation,
                    which is the panel two tabs to the left. */}
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {say(LEDGER_COPY.mvWhat, lang)}
                </span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
                />
              </label>

              <button
                type="button"
                data-press
                disabled={!complete || busy}
                onClick={() => void send()}
                className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {labels.save}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="text-fg-muted h-10 rounded-md px-3 text-sm font-medium"
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        ) : null}

        <div data-scroll className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div
              className={`bg-bg-subtle text-fg-subtle grid ${MOVE_COLUMNS} gap-3.5 border-b px-[22px] py-[11px] text-xs font-semibold`}
            >
              <span>{say(LEDGER_COPY.mvWhen, lang)}</span>
              <span>{say(LEDGER_COPY.mvWhat, lang)}</span>
              <span>{say(LEDGER_COPY.mvAccount, lang)}</span>
              <span>{say(LEDGER_COPY.mvWho, lang)}</span>
              <span className="text-right">{say(LEDGER_COPY.mvAmount, lang)}</span>
              <span className="text-right">{say(LEDGER_COPY.mvBalance, lang)}</span>
            </div>

            {rows.map(({ move, index }) => (
              <div
                key={index}
                data-row
                className={`border-divider grid ${MOVE_COLUMNS} items-center gap-3.5 border-b border-l-[3px] px-[22px] py-3`}
                style={{
                  borderLeftColor: move.amount > 0 ? 'var(--success-500)' : 'var(--danger-500)',
                }}
              >
                <span data-num className="text-fg-muted text-xs">
                  {move.when}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{say(move.what, lang)}</span>
                  <span className="text-fg-subtle text-2xs mt-0.5 block">
                    {say(move.category, lang)}
                  </span>
                </span>

                <span className="text-fg-muted min-w-0 truncate text-sm">
                  {say(move.account, lang)}
                </span>
                <span className="text-fg-muted min-w-0 truncate text-xs">{move.who}</span>

                <span
                  data-num
                  className={`text-right text-sm font-semibold ${
                    move.amount > 0 ? 'text-success-600' : 'text-danger-600'
                  }`}
                >
                  {move.amount > 0 ? '+' : '−'}
                  {money[`mvRow_${index}`] ?? ''}
                </span>

                <span data-num className="text-fg-muted text-right text-sm">
                  {money[`mvBal_${index}`] ?? ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-fg-muted px-[22px] py-3.5 text-xs leading-relaxed">
          {say(LEDGER_COPY.mvNote, lang)}
        </p>
      </section>
    </>
  );
}

function MoveKpi({
  label,
  value,
  note,
  ink,
}: {
  label: string;
  value: string;
  note: string;
  ink?: string;
}) {
  return (
    <div data-kpi className="bg-surface rounded-lg border px-[18px] py-4">
      <div className="text-fg-subtle tracking-caps text-3xs font-semibold uppercase">{label}</div>
      <div
        data-num
        className={`font-display mt-[5px] text-2xl font-bold tracking-tight ${ink ?? ''}`}
      >
        {value}
      </div>
      <div className="text-fg-subtle text-2xs mt-[3px]">{note}</div>
    </div>
  );
}
