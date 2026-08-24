'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post, type Lang } from '@/lib/console-post';

import type { CaseOutcome } from './cases-data';

/**
 * The four answers to a complaint, and what the card becomes once one is given.
 *
 * `decide()` at `Smart Restaurant OS.dc.html:16906` does two things and this
 * does the same two: it records the outcome on the card, and it says what the
 * guest will experience. Neither half works alone — a toast with no visible
 * change leaves the operator unsure whether it landed, and a change with no
 * sentence leaves them guessing what the guest was told.
 *
 * The order is the design's: full refund, half, points, decline — most generous
 * to least, so the cheapest answer is never the first thing under the thumb.
 *
 * Everything arrives resolved except the language, which `post()` needs to pick
 * which of the API's three refusal sentences to show. No catalogue crosses the
 * boundary — the house pattern for client leaves in this console.
 */
export function CaseActions({
  caseId,
  amounts,
  lang,
  labels,
  messages,
  outcomeLabels,
  settledBy,
}: {
  /** The row's own id, or `null` for a fixture — see `Complaint.apiId`. */
  caseId: number | null;
  /**
   * What each of the first two buttons has on it, in tiyin.
   *
   * Sent with the decision rather than left to the server, because the button
   * the answerer pressed said a number out loud. The server computes the same
   * two by default and the halving rounds identically on both sides; sending it
   * is what makes "I have refunded you 24 000" true even if somebody edits the
   * disputed amount between the render and the click.
   */
  amounts: { full: number; half: number };
  lang: Lang;
  labels: { refundFull: string; refundHalf: string; givePoints: string; decline: string };
  /** What the toast says, per outcome, already in the reader's language. */
  messages: Readonly<Record<CaseOutcome, string>>;
  outcomeLabels: Readonly<Record<CaseOutcome, string>>;
  /** "Settled by X" — the same sentence the server draws on an already-closed case. */
  settledBy: string;
}) {
  const [outcome, setOutcome] = useState<CaseOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const decide = (next: CaseOutcome) => async () => {
    if (busy) return;

    /*
     * The card moves first, and then the write happens.
     *
     * An answerer is usually on the telephone while they tap, and a button that
     * does nothing for a second is a button they tap again. If the API refuses —
     * the ceiling, a complaint somebody else has already answered — the card
     * goes back and the refusal is shown in the API's own words, which are the
     * ones that say why.
     */
    setOutcome(next);
    setBusy(true);

    // A fixture row: nothing upstream to aim at. The card still moves and the
    // toast still names what happened, so a demo console is not a broken one.
    if (caseId === null) {
      flash(messages[next]);
      setBusy(false);

      return;
    }

    const amount =
      next === 'refunded' ? amounts.full : next === 'partly' ? amounts.half : undefined;

    const sent = await post<unknown>(
      '/api/crm',
      { action: 'decide', id: caseId, outcome: next, amountTiyin: amount },
      lang,
    );

    setBusy(false);

    if (!sent.ok) {
      setOutcome(null);
      flash.problem(sent.message ?? labels.decline);

      return;
    }

    flash(messages[next]);
  };

  const TINT: Record<CaseOutcome, string> = {
    refunded: 'bg-success-500',
    partly: 'bg-brand-500',
    points: 'bg-accent-500',
    declined: 'bg-danger-500',
  };

  const INK: Record<CaseOutcome, string> = {
    refunded: 'text-success-700',
    partly: 'text-brand-700',
    points: 'text-accent-700',
    declined: 'text-danger-700',
  };

  if (outcome !== null) {
    return (
      <div className="bg-bg-muted mt-4 flex items-center gap-2.5 rounded-md px-3.5 py-3">
        <span
          className={`grid size-[18px] flex-none place-items-center rounded-full text-[10px] font-bold text-white ${TINT[outcome]}`}
          aria-hidden
        >
          {outcome === 'declined' ? '✕' : '✓'}
        </span>
        <span className={`text-sm font-semibold ${INK[outcome]}`}>{outcomeLabels[outcome]}</span>
        <span data-num className="text-fg-subtle ml-auto text-xs">
          {settledBy}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        data-press
        onClick={decide('refunded')}
        disabled={busy}
        className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-3.5 text-sm font-semibold text-white"
      >
        {labels.refundFull}
      </button>
      <button
        type="button"
        data-press
        onClick={decide('partly')}
        disabled={busy}
        className="border-border-strong bg-surface hover:bg-bg-muted h-9 rounded-md border px-3.5 text-sm font-semibold"
      >
        {labels.refundHalf}
      </button>
      <button
        type="button"
        data-press
        onClick={decide('points')}
        disabled={busy}
        className="border-border-strong bg-surface hover:bg-bg-muted h-9 rounded-md border px-3.5 text-sm font-semibold"
      >
        {labels.givePoints}
      </button>
      <button
        type="button"
        data-press
        onClick={decide('declined')}
        disabled={busy}
        className="text-danger-600 hover:bg-danger-50 h-9 rounded-md px-3.5 text-sm font-semibold"
      >
        {labels.decline}
      </button>
    </div>
  );
}
