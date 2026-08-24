'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';

import {
  breakdownOf,
  countTotal,
  isCounted,
  NoteCount,
  type NoteCounts,
} from '@/components/note-count';
import type { CashLadder } from '@/lib/cash-notes';

import { ApprovalPin } from '../../approval-pin';
import type { ShiftDocument } from './till-data';

/**
 * The X and the Z, which were two dead buttons.
 *
 * `page.tsx` drew both with no handler and a comment saying the endpoint was to
 * come — but the endpoint was already there: `GET /finance/shifts/{id}/report`
 * answers the whole document, and answers it hypothetically when you tell it
 * what the drawer holds. Both reports were one wiring away for months.
 *
 * **X is a read and never anything else.** A cashier takes one mid-shift to
 * hand over, to check a suspicion, or because a manager asked. If it closed
 * anything, or reset a counter, taking one would cost a shift — so it opens the
 * same document with a different heading and no buttons.
 *
 * **Z is count first, then variance, then confirm — in that order.** The design
 * insists on the order and it is the whole design: a cashier who sees the
 * expected figure before counting counts to it. So the expected number is not
 * on screen while the notes are being entered; it appears with the variance, in
 * the step after.
 */
type Step = 'count' | 'variance';

export function TillReports({
  report,
  ladder,
  labels,
}: {
  report: ShiftDocument;
  ladder: CashLadder;
  labels: Record<string, string>;
}) {
  const locale = useLocale() as 'uz' | 'ru' | 'en';
  const money = (tiyin: number) => formatTiyinAmount(tiyin, locale);

  const [open, setOpen] = useState<'x' | 'z' | null>(null);
  const [step, setStep] = useState<Step>('count');
  const [counts, setCounts] = useState<NoteCounts>({});
  const [reason, setReason] = useState('');
  const [askingPin, setAskingPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  const counted = countTotal(ladder.notes, counts);
  const expected = report.drawer.expected_cash;
  const difference = counted - expected;

  /*
   * The thresholds are the server's, read off the document rather than written
   * here. A console that carried its own copy would let a shift close clean on
   * screen and be refused by the API, which is the worst possible order for a
   * cashier to find out in.
   */
  const { reason: reasonAt, approval: approvalAt } = report.variance.thresholds;
  const gap = Math.abs(difference);
  const needsReason = gap >= reasonAt;
  const needsApproval = gap >= approvalAt;

  const reset = () => {
    setOpen(null);
    setStep('count');
    setCounts({});
    setReason('');
    setFailed(null);
  };

  async function close() {
    if (busy) return;

    setBusy(true);
    setFailed(null);

    try {
      const response = await fetch('/api/finance/shift-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_id: report.shift.id,
          /*
           * The notes, not the total. The server recomputes the sum from the
           * breakdown, which is what makes the count auditable: a total typed
           * by hand is a number nobody can check against a drawer.
           */
          denominations: breakdownOf(ladder.notes, counts),
          counted_cash: counted,
          reason: reason.trim() === '' ? null : reason.trim(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setFailed(body?.message ?? labels.closeFailed);

        return;
      }

      setClosed(true);
      reset();
      window.location.reload();
    } catch {
      setFailed(labels.closeFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen('x')}
        className="bg-bg-muted text-fg h-11 w-full rounded-md text-sm font-semibold"
      >
        {labels.xReport}
      </button>

      <button
        type="button"
        onClick={() => setOpen('z')}
        disabled={closed || report.shift.status === 'closed'}
        className="bg-danger-500 mt-3 h-11 w-full rounded-md text-sm font-semibold text-white disabled:opacity-45"
      >
        {labels.zReport}
      </button>

      {open !== null ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-6"
          style={{ background: 'rgba(15,19,32,.45)' }}
          onClick={reset}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open === 'x' ? labels.xReport : labels.zReport}
            onClick={(event) => event.stopPropagation()}
            data-scroll
            className="bg-surface-raised max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border p-6 shadow-xl"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  {open === 'x' ? labels.xReport : labels.zReport}
                </h3>
                <p data-num className="text-fg-subtle mt-1 text-xs">
                  {report.shift.number} · {labels.openedAt}{' '}
                  {report.shift.opened_at?.slice(11, 16) ?? '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                aria-label={labels.close}
                className="text-fg-muted hover:bg-bg-muted grid size-8 flex-none place-items-center rounded-md"
              >
                ✕
              </button>
            </header>

            {/* ------------------------------------------------ the X report */}
            {open === 'x' ? (
              <>
                <dl className="border-divider mt-5 border-t pt-4 text-sm">
                  <Line label={labels.takings} value={money(report.turnover.takings)} strong />
                  <Line label={labels.bills} value={String(report.turnover.bills)} />
                  <Line label={labels.averageBill} value={money(report.turnover.average_bill)} />
                  <Line
                    label={labels.refunded}
                    value={`− ${money(report.turnover.refunded)}`}
                    tone={report.turnover.refunded > 0 ? 'danger' : undefined}
                  />
                </dl>

                <h4 className="text-2xs tracking-caps text-fg-subtle mt-5 mb-2 font-semibold uppercase">
                  {labels.byMethod}
                </h4>

                <dl className="text-sm">
                  {report.methods.map((method) => (
                    <Line
                      key={method.method}
                      label={labels[`method_${method.method}`] ?? method.method}
                      value={money(method.amount)}
                      note={
                        method.fees > 0
                          ? labels.afterFees.replace('{amount}', money(method.net))
                          : undefined
                      }
                    />
                  ))}
                </dl>

                {/*
                 * The drawer, and only the parts an X can honestly show. The
                 * counted figure and the variance are deliberately absent —
                 * nobody has counted yet, and printing "variance: 0" mid-shift
                 * would be a lie a manager might act on.
                 */}
                <h4 className="text-2xs tracking-caps text-fg-subtle mt-5 mb-2 font-semibold uppercase">
                  {labels.drawer}
                </h4>

                <dl className="text-sm">
                  <Line label={labels.openingFloat} value={money(report.drawer.opening_cash)} />
                  <Line label={labels.cashTaken} value={money(report.drawer.cash_taken)} />
                  <Line label={labels.paidOut} value={`− ${money(report.drawer.cash_paid_out)}`} />
                  <Line label={labels.expected} value={money(expected)} strong />
                </dl>

                <p className="text-fg-subtle mt-5 text-xs leading-normal">{labels.xNote}</p>
              </>
            ) : null}

            {/* ------------------------------------------------ the Z report */}
            {open === 'z' && step === 'count' ? (
              <>
                <p className="text-fg-muted mt-4 text-sm leading-normal">{labels.countSub}</p>

                <div className="mt-4">
                  <NoteCount
                    notes={ladder.notes}
                    counts={counts}
                    onChange={setCounts}
                    labels={{ note: labels.note, pieces: labels.pieces, sum: labels.sum }}
                  />
                </div>

                <div className="border-divider mt-4 flex items-baseline justify-between border-t pt-3.5">
                  <span className="text-sm font-semibold">{labels.counted}</span>
                  <span data-num className="font-display text-xl font-bold">
                    {money(counted)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!isCounted(ladder.notes, counts)}
                  onClick={() => setStep('variance')}
                  className="bg-brand-500 mt-5 h-12 w-full rounded-md text-sm font-semibold text-white disabled:opacity-45"
                >
                  {labels.next}
                </button>
              </>
            ) : null}

            {open === 'z' && step === 'variance' ? (
              <>
                <dl className="border-divider mt-5 border-t pt-4 text-sm">
                  <Line label={labels.expected} value={money(expected)} />
                  <Line label={labels.counted} value={money(counted)} />
                  <Line
                    label={labels.variance}
                    value={
                      difference === 0
                        ? labels.matched
                        : `${difference > 0 ? '+' : '−'}${money(gap)}`
                    }
                    strong
                    tone={difference === 0 ? 'success' : 'danger'}
                  />
                </dl>

                {needsReason ? (
                  <label className="mt-4 block">
                    <span className="text-fg-subtle mb-1.5 block text-xs">
                      {difference < 0 ? labels.shortReason : labels.overReason}
                    </span>
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="bg-bg-subtle border-border h-12 w-full rounded-md border px-3.5 text-sm"
                      autoFocus
                    />
                  </label>
                ) : null}

                {needsApproval ? (
                  <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-3 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
                    {labels.needsApproval.replace('{amount}', money(approvalAt))}
                  </p>
                ) : null}

                {failed !== null ? (
                  <p
                    role="alert"
                    className="bg-danger-50 text-danger-700 mt-3 rounded-md px-3.5 py-2.5 text-xs"
                  >
                    {failed}
                  </p>
                ) : null}

                <div className="mt-5 flex gap-2.5">
                  {/* Counting again is offered first and always. A cashier who
                      has miscounted must be able to go back rather than explain
                      a discrepancy that does not exist. */}
                  <button
                    type="button"
                    onClick={() => setStep('count')}
                    className="h-12 flex-1 rounded-md border text-sm font-semibold"
                  >
                    {labels.countAgain}
                  </button>

                  <button
                    type="button"
                    disabled={busy || (needsReason && reason.trim().length < 3)}
                    onClick={() => (needsApproval ? setAskingPin(true) : void close())}
                    className="bg-danger-500 h-12 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-45"
                  >
                    {labels.closeShift}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {askingPin ? (
        <ApprovalPin
          reason={labels.pinReason.replace(
            '{amount}',
            `${difference > 0 ? '+' : '−'}${money(gap)}`,
          )}
          labels={{
            title: labels.pinTitle,
            sub: labels.pinSub,
            cancel: labels.cancel,
            digitsEntered: labels.digitsEntered,
          }}
          onCancel={() => setAskingPin(false)}
          onApprove={() => {
            setAskingPin(false);
            void close();
          }}
        />
      ) : null}
    </>
  );
}

function Line({
  label,
  value,
  note,
  strong,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
  tone?: 'success' | 'danger';
}) {
  const ink = tone === 'success' ? 'text-success-700' : tone === 'danger' ? 'text-danger-700' : '';

  return (
    <div className="border-divider flex items-baseline justify-between gap-3 border-b py-2 last:border-0">
      <dt className={strong ? 'font-semibold' : 'text-fg-muted'}>
        {label}
        {note ? <span className="text-fg-subtle block text-xs">{note}</span> : null}
      </dt>
      <dd data-num className={`${strong ? 'font-bold' : 'font-medium'} ${ink}`}>
        {value}
      </dd>
    </div>
  );
}
