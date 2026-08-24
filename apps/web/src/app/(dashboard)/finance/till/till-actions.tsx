'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { apiId, post } from '@/lib/console-post';

/**
 * The two things a cashier does to the drawer that are not a report.
 *
 * Client, because both are a click that writes. They are together in one file
 * because they share the one rule that matters: neither may pretend. A drop
 * that happened only in the browser would leave the drawer reading short for
 * the rest of the shift with the cashier's name against it, and a reprint that
 * only toasted would hand a guest a receipt nobody counted.
 *
 * Both go through a route handler rather than straight to Laravel — the session
 * token is an httpOnly cookie the browser cannot read, deliberately.
 */

type Lang = 'uz' | 'ru' | 'en';

/**
 * Taking money out of the till, note counted or not.
 *
 * The design draws one button and no form (`§3.6`), which is a prototype's
 * privilege: `POST /finance/shifts/{id}/collection` will not accept a drop
 * without a sum, and inventing one would be the worst possible default. So the
 * button opens the smallest form that can be sent — how much, and why.
 *
 * The reason is optional on screen and mandatory on the wire. The ledger stores
 * it as the expense's description and it is the only thing that distinguishes
 * one payout from another afterwards, so an empty box falls back to the drop's
 * own name rather than to nothing.
 *
 * `router.refresh()` on success, and it is not cosmetic: the expected figure,
 * the movement list and the drop total are all rendered on the server from the
 * shift document. Leaving them stale would show a drawer that still holds money
 * somebody has just carried to the safe.
 */
export function CashDrop({
  shiftId,
  live,
  labels,
}: {
  shiftId: number;
  /** False when the screen is drawing the demo document rather than a real shift. */
  live: boolean;
  labels: Record<'open' | 'amount' | 'reason' | 'confirm' | 'cancel' | 'asked', string>;
}) {
  const locale = useLocale() as Lang;
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  /* What was typed, as whole so'm. Separators are dropped rather than parsed:
     a person entering millions types spaces, dots or commas depending on the
     keyboard, and none of them are part of the number. */
  const som = Number.parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;

  /* So'm above, tiyin on the wire. The one conversion this form does, and it
     is integer throughout — the drawer is counted in notes and a fraction of a
     tiyin has never been in one. */
  const tiyin = som * 100;

  function reset() {
    setOpen(false);
    setAmount('');
    setReason('');
  }

  async function drop() {
    if (busy) return;

    if (tiyin <= 0) {
      // The catalogue sentence for this button already lists what a drop needs:
      // the sum, the envelope number and a second signature.
      flash.problem(labels.asked);

      return;
    }

    const told = `${labels.open} · ${formatTiyinAmount(tiyin, locale)}`;

    /* No live shift behind this render, so there is no drawer to take money
       out of. The toast is the whole feature on the demo console, and it says
       what it would have said. */
    if (!live || shiftId <= 0) {
      reset();
      flash(told);

      return;
    }

    setBusy(true);

    const answer = await post<unknown>(
      '/api/finance/cash-drop',
      {
        shiftId,
        amountTiyin: tiyin,
        reason: reason.trim() === '' ? labels.open : reason.trim(),
      },
      locale,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.asked);

      return;
    }

    reset();
    flash(told);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        data-press
        onClick={() => setOpen(true)}
        className="bg-bg-muted text-fg h-11 w-full rounded-md text-sm font-semibold"
      >
        {labels.open}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label>
        <span className="text-fg-subtle mb-1.5 block text-xs">{labels.amount}</span>
        <input
          autoFocus
          inputMode="numeric"
          data-num
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-right text-sm"
        />
      </label>

      <label>
        <span className="text-fg-subtle mb-1.5 block text-xs">{labels.reason}</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          data-press
          onClick={() => void drop()}
          className="bg-brand-500 hover:bg-brand-600 h-10 flex-1 rounded-md text-sm font-semibold text-white"
        >
          {labels.confirm}
        </button>
        <button
          type="button"
          onClick={reset}
          className="text-fg-muted h-10 rounded-md px-3 text-sm font-medium"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}

/**
 * A second copy of a receipt somebody already has.
 *
 * It is not a second sale and not a second declaration: the API only stamps
 * `NUSXA` and increments the copy counter, which is exactly what the tax rules
 * want — a duplicate that looked like an original would be a receipt the
 * restaurant declared once and handed out twice.
 *
 * A receipt that was never registered refuses (`finance.fiscal_not_registered`)
 * and the reason arrives in the reader's own language, so nothing is decided
 * here about which rows may be copied.
 */
export function ReprintReceipt({
  id,
  label,
  message,
}: {
  id: string;
  label: string;
  /** Already in the reader's language: resolved on the server, as the console does. */
  message: string;
}) {
  const locale = useLocale() as Lang;
  const [busy, setBusy] = useState(false);

  async function reprint() {
    if (busy) return;

    const receiptId = apiId(id);

    /* A fixture row — the demo till carries `r1`, `r2`. Nothing to copy, and
       the toast is the whole feature on a console with no session behind it. */
    if (receiptId === null) {
      flash(message);

      return;
    }

    setBusy(true);

    const answer = await post<unknown>('/api/finance/receipt-duplicate', { receiptId }, locale);

    setBusy(false);

    if (answer.ok) {
      flash(message);

      return;
    }

    flash.problem(answer.message ?? message);
  }

  return (
    <button
      type="button"
      data-press
      onClick={() => void reprint()}
      className="border-border-strong hover:bg-bg-muted h-8 rounded-md border px-3 text-xs font-semibold"
    >
      {label}
    </button>
  );
}
