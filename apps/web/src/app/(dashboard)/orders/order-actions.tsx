'use client';

import { useState } from 'react';

/**
 * The confirm step the order drawer's four buttons open.
 *
 * Split out of ./orders-table.tsx for the reason `(pos)/pos/bill-actions.tsx`
 * was split out of the till: that file is already the biggest thing on this
 * screen, and all four of these are one shape — a sheet over the drawer, a
 * reason, and one call.
 *
 * **Three of the four will not submit without a reason, and that is the point
 * of the whole sheet.** Void, refund and discount are the three rows a
 * loss-prevention report is built out of, and "−48 000, Aziza R." with no
 * sentence beside it tells a manager nothing at all. The server enforces the
 * same floor (`BillActionController` wants three characters); asking here
 * means the reader finds out before the round trip rather than after it.
 *
 * Transfer takes no reason because the endpoint takes none: nothing comes off
 * the bill, and what changed is written on the bill itself.
 */
export type OrderAction = 'void' | 'refund' | 'discount' | 'transfer';

/** What the sheet hands back, in the shape ../../api/orders/route.ts reads. */
export type ActionPayload =
  | { action: 'void'; reason: string }
  | { action: 'refund'; reason: string }
  | { action: 'discount'; reason: string; amount?: number; percent?: number }
  | { action: 'transfer'; tableId?: number; tableLabel?: string; waiterId?: number };

/** A pickable row for the transfer sheet — a table, or a person. */
export type Choice = { id: number; label: string };

/**
 * What the last attempt came back with, when it came back refused.
 *
 * `retry` is the interesting half and it is only ever true for a discount over
 * the reader's ceiling: the API raised a request in a manager's queue and sent
 * its id back, so the same sheet can send the same body again once somebody
 * has signed. Everything else is a refusal nothing on this screen can change,
 * and the sentence is the API's own.
 */
export type Refusal = { message: string; retry: boolean };

const SHEET = 'fixed inset-0 z-[240] flex items-end justify-center sm:items-center';
const PANEL =
  'bg-surface-raised w-full max-w-[420px] rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl';

/** The house floor for a reason, matched to the server's own. */
const MIN_REASON = 3;

/** Only digits survive: a reader typing "48 000" means forty-eight thousand. */
const digits = (value: string): number => Number(value.replace(/\D/g, '') || '0');

export function OrderActionSheet({
  action,
  labels,
  tables,
  waiters,
  busy,
  refusal,
  onClose,
  onConfirm,
}: {
  action: OrderAction;
  labels: Record<string, string>;
  /** The floor, for a transfer. Empty when this screen has no session. */
  tables: readonly Choice[];
  waiters: readonly Choice[];
  /** True while the write is in flight — the sheet stays open and waits. */
  busy: boolean;
  refusal: Refusal | null;
  onClose: () => void;
  onConfirm: (payload: ActionPayload) => void;
}) {
  const [reason, setReason] = useState('');
  /** Percentage or figure. The endpoint takes either; a sheet must pick one. */
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [percent, setPercent] = useState(5);
  const [amount, setAmount] = useState('');
  const [table, setTable] = useState<number | null>(null);
  const [waiter, setWaiter] = useState<number | null>(null);

  const needsReason = action !== 'transfer';
  const reasonOk = reason.trim().length >= MIN_REASON;

  /*
   * The percentage steps the till offers, so the two screens ask the same
   * question. The ceiling is not drawn here and not enforced: a console that
   * hid a step would be a client deciding permission, and it would be wrong the
   * moment the terminal's settings changed. Above the line the server refuses
   * and says so, which is more use to the reader than a missing button.
   */
  const STEPS = [5, 10, 15, 20, 50, 100] as const;

  const ready = (): boolean => {
    if (busy) return false;
    if (needsReason && !reasonOk) return false;
    if (action === 'discount') return mode === 'percent' || digits(amount) > 0;
    if (action === 'transfer') return table !== null || waiter !== null;

    return true;
  };

  function submit() {
    if (!ready()) return;

    const said = reason.trim();

    if (action === 'void' || action === 'refund') {
      onConfirm({ action, reason: said });

      return;
    }

    if (action === 'discount') {
      onConfirm(
        mode === 'percent'
          ? { action, reason: said, percent }
          : // Tiyin, never so'm — 1 UZS = 100 tiyin, and the endpoint's
            // `amount` is the same integer the bill is stored in.
            { action, reason: said, amount: digits(amount) * 100 },
      );

      return;
    }

    onConfirm({
      action,
      ...(table === null
        ? {}
        : {
            tableId: table,
            // The label travels with the id and never alone. It is
            // denormalised on the bill so that renaming a table later does not
            // rewrite where a past order was served — see the route handler.
            tableLabel: tables.find((entry) => entry.id === table)?.label,
          }),
      ...(waiter === null ? {} : { waiterId: waiter }),
    });
  }

  const danger = action === 'void' || action === 'refund';

  return (
    <div
      data-fade
      className={SHEET}
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      {/* `data-sheet` behind `data-fade`: the design's single overlay motion,
          200ms and up fourteen pixels, with motion.css carrying the
          reduced-motion escape. */}
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={labels[`confirm_${action}`]}
        className={PANEL}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold tracking-tight">
          {labels[`confirm_${action}`]}
        </h3>
        <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{labels[`sub_${action}`]}</p>

        {action === 'discount' ? (
          <>
            <div className="bg-bg-subtle mt-4 grid grid-cols-2 gap-1 rounded-md p-1">
              {(['percent', 'amount'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                  className={`h-9 rounded-sm text-sm font-semibold ${
                    mode === option ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
                  }`}
                >
                  {option === 'percent' ? labels.discountByPercent : labels.discountByAmount}
                </button>
              ))}
            </div>

            {mode === 'percent' ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    data-num
                    aria-pressed={percent === step}
                    onClick={() => setPercent(step)}
                    className={`h-12 rounded-md border text-base font-semibold ${
                      percent === step
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'bg-surface'
                    }`}
                  >
                    {step}%
                  </button>
                ))}
              </div>
            ) : (
              <label className="mt-3 block">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {labels.discountAmountLabel}
                </span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="numeric"
                  placeholder="48 000"
                  autoFocus
                  className="border-border-strong bg-surface font-display h-12 w-full rounded-md border px-3.5 text-lg font-semibold"
                />
              </label>
            )}
          </>
        ) : null}

        {action === 'transfer' ? (
          <>
            {tables.length === 0 && waiters.length === 0 ? (
              <p className="text-fg-subtle mt-4 text-xs leading-normal">{labels.transferNowhere}</p>
            ) : null}

            <PickGrid
              title={labels.transferTable}
              options={tables}
              chosen={table}
              onChoose={(id) => setTable(table === id ? null : id)}
            />
            <PickGrid
              title={labels.transferWaiter}
              options={waiters}
              chosen={waiter}
              onChoose={(id) => setWaiter(waiter === id ? null : id)}
              wide
            />
          </>
        ) : null}

        {needsReason ? (
          <label className="mt-4 block">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.reason}</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={255}
              autoFocus={action !== 'discount'}
              className="bg-bg-subtle border-border h-12 w-full rounded-md border px-3.5 text-sm"
            />
            {/* Shown once there is something to be short, not on an empty
                field: a rule stated before anybody has typed reads as a
                complaint about nothing. */}
            {reason.length > 0 && !reasonOk ? (
              <span className="text-warning-700 mt-1.5 block text-xs">{labels.reasonShort}</span>
            ) : null}
          </label>
        ) : null}

        {refusal === null ? null : (
          <div
            role="alert"
            className={`mt-4 rounded-md border px-3.5 py-2.5 text-xs leading-normal ${
              refusal.retry
                ? 'border-warning-500/30 bg-warning-50 text-warning-700'
                : 'border-danger-500/30 bg-danger-50 text-danger-700'
            }`}
          >
            {refusal.retry ? (
              <strong className="block font-semibold">{labels.approvalTitle}</strong>
            ) : null}
            {refusal.message}
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-md border text-sm font-semibold"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            data-press
            disabled={!ready()}
            onClick={submit}
            className={`h-12 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-45 ${
              danger ? 'bg-danger-500' : 'bg-brand-500'
            }`}
          >
            {/*
             * The button's own verb, except for the discount: three of the
             * four drawer labels are verbs a person does ("Bekor qilish",
             * "Qaytarish", "Ko‘chirish") and the fourth is the noun on a
             * receipt, so that one says "apply" — which is also the word the
             * till puts under the same sheet.
             *
             * Renamed once there is a signature to spend, because the press
             * sends the identical body: a second verb would be a second thing
             * the reader thinks they are doing.
             */}
            {refusal?.retry === true
              ? labels.approvalRetry
              : action === 'discount'
                ? labels.apply
                : labels[`action_${action}`]}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One row of choices, or nothing at all.
 *
 * Drawn away entirely when the list is empty rather than left as a heading over
 * a gap — a console with no `tables.view` behind it should not appear to be
 * offering a floor it cannot show.
 */
function PickGrid({
  title,
  options,
  chosen,
  onChoose,
  wide = false,
}: {
  title: string;
  options: readonly Choice[];
  chosen: number | null;
  onChoose: (id: number) => void;
  wide?: boolean;
}) {
  if (options.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="text-fg-subtle mb-1.5 block text-xs">{title}</span>
      <div
        data-scroll
        className={`grid max-h-[28vh] gap-2 overflow-y-auto ${wide ? 'grid-cols-2' : 'grid-cols-4'}`}
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={chosen === option.id}
            onClick={() => onChoose(option.id)}
            className={`h-11 truncate rounded-md border px-2 text-sm font-semibold ${
              chosen === option.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'bg-surface'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
