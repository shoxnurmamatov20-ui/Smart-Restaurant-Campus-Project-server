'use client';

import { flash } from '@restaurant/ui';
import { useState } from 'react';

import { APPROVALS_COPY, copy, FLASH, SHARED } from '@restaurant/surfaces/crew/copy';
import {
  APPROVALS,
  say,
  type Approval,
  type Lang,
  type Trilingual,
} from '@restaurant/surfaces/crew/data';
import { realId } from '@restaurant/surfaces/crew/live';
import { EmptyState, NotWired } from './bits';

type Answer = 'approved' | 'declined';

/**
 * The reason a manager carries this app at all.
 *
 * A waiter cannot give a fifteen percent discount, void a fired dish or refund
 * a card without someone senior saying yes, and the manager is not standing
 * next to them — they are in the office, at the other branch, or at home. Every
 * minute this queue sits unanswered is a table waiting with a bill in front of
 * them, which is why the badge on the dock counts it and why the answer is two
 * taps from a lock screen.
 *
 * The card keeps its result rather than vanishing. A queue that empties as you
 * answer it gives a manager no way to check what they just did, and "did I
 * approve that or decline it" at the end of a shift is a question with money
 * attached.
 *
 * A client component because the answer is state; the list itself is not.
 */
export function ApprovalsPanel({
  lang,
  items = APPROVALS,
  live = false,
}: {
  lang: Lang;
  /**
   * The pending approvals, from `GET /api/v1/pos/approvals`.
   *
   * Defaulted to the fixtures rather than required: the panel is a client
   * component and cannot fetch, so the page above it either hands over a live
   * queue or does not.
   */
  items?: readonly Approval[];
  /**
   * Whether the queue above came from the server.
   *
   * The distinction the screen has to make is between "nothing to approve" and
   * "I could not ask" — a manager who believes their queue is clear because the
   * API timed out is a table waiting with a bill in front of them.
   */
  live?: boolean;
}) {
  const t = copy(APPROVALS_COPY, lang);
  const s = copy(SHARED, lang);
  const f = copy(FLASH, lang);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /*
   * Answering says so out loud, because the card that records it can be below
   * the fold on a phone with three requests waiting — and a manager who taps
   * approve, sees nothing move and taps again has answered twice.
   *
   * The two sentences are the design's, and they differ in more than tone:
   * approving notifies the person who asked, declining will come back for a
   * reason.
   *
   * `POST /crew/approval` forwards to `pos/approvals/{id}/decide`. Not queued
   * for later like the eight verbs in `crew-queue.ts`: a decision held on a
   * phone with no signal is a waiter standing at a table believing an answer is
   * coming, so this is one of the few things in the app worth failing loudly.
   * The card only flips once the server has taken it.
   */
  const answer = async (id: string, verdict: Answer) => {
    if (busy !== null) return;

    /*
     * A fixture card. The panel falls back to `APPROVALS` whenever the queue
     * could not be read, and answering one of those would post an id naming
     * nothing — so it is marked on the phone and the strip above already says
     * that is all that happened.
     */
    if (realId(id) === null) {
      setAnswers((all) => ({ ...all, [id]: verdict }));
      flash.problem(s.notWired);

      return;
    }

    setBusy(id);

    let taken = false;

    try {
      const response = await fetch('/crew/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: Number(id), approved: verdict === 'approved' }),
      });

      /*
       * `redirected` as well as `ok`. With no shift cookie `middleware.ts`
       * bounces this POST to the keypad and `fetch` follows it, so the answer
       * is a 200 of HTML — and reading that as a yes would flip the card while
       * the waiter went on waiting.
       */
      taken = response.ok && !response.redirected;
    } catch {
      // The network, not a refusal. Kept apart because the two need different
      // words: one is "try again", the other is "this cannot be done".
      taken = false;
    }

    setBusy(null);

    if (!taken) {
      /*
       * Nothing is marked. A card that flipped on a failed request would leave
       * a manager certain they had answered — and the waiter still waiting,
       * which is the exact failure this queue exists to end.
       */
      flash.problem(t.intro);

      return;
    }

    setAnswers((all) => ({ ...all, [id]: verdict }));
    flash(verdict === 'approved' ? f.approved : f.declined);
  };

  const kind: Record<Approval['kind'], string> = {
    discount: t.kindDiscount,
    void: t.kindVoid,
    refund: t.kindRefund,
  };

  /*
   * The tone is per kind, not per amount. A refund and a post-fire deletion are
   * the two that cost real money and leave the least trace, so they carry the
   * red edge whatever the figure — a 48 000 so'm void is still a plate that was
   * cooked, paid for out of stock, and thrown away.
   */
  const edge: Record<Approval['kind'], string> = {
    discount: 'border-l-warning-500',
    void: 'border-l-danger-500',
    refund: 'border-l-danger-500',
  };

  if (items.length === 0) return <EmptyState>{t.empty}</EmptyState>;

  return (
    <section>
      <p className="text-fg-muted mb-3.5 text-sm leading-normal">{t.intro}</p>
      {/*
       * Shown only when the queue is fixtures.
       *
       * The line says an answer stays on this phone, and it is now true of
       * exactly one case: a queue that could not be read has no real ids, so
       * nothing on it can be decided upstream. When the list is live the answer
       * goes to `pos/approvals/{id}/decide` and the strip has no business being
       * there — a warning that is wrong half the time is a warning nobody reads
       * the other half.
       */}
      {!live ? <NotWired>{s.notWired}</NotWired> : null}

      <ul className="flex flex-col gap-2.5">
        {items.map((request) => {
          const verdict = answers[request.id];

          return (
            <li
              key={request.id}
              className={`border-border bg-surface rounded-[14px] border border-l-[3px] px-4 py-3.5 ${edge[request.kind]}`}
            >
              <div className="flex items-baseline justify-between gap-2.5">
                <h3 className="text-sm font-semibold">{kind[request.kind]}</h3>
                <span data-num className="text-fg-subtle text-2xs flex-none">
                  {say(request.ago, lang)}
                </span>
              </div>

              <p data-num className="font-display mt-1.5 text-2xl font-bold tracking-tight">
                {phrase(request.amount, lang)}
              </p>

              <p className="text-fg-muted mt-1.5 text-xs leading-normal">
                {say(request.detail, lang)}
              </p>
              <p className="text-fg-subtle mt-1 text-xs leading-normal">
                {t.reason}: {say(request.reason, lang)}
              </p>

              {verdict === undefined ? (
                <div className="mt-3 flex gap-2">
                  {/*
                   * 44px each and equal width. Approve is not made larger than
                   * decline: a manager glancing at a phone between two other
                   * things should not have the cheaper answer be the easier
                   * one to hit.
                   */}
                  <button
                    type="button"
                    data-press
                    disabled={busy !== null}
                    onClick={() => void answer(request.id, 'approved')}
                    className="bg-brand-500 h-11 flex-1 rounded-[10px] text-sm font-semibold text-white disabled:opacity-45"
                  >
                    {t.approve}
                  </button>
                  <button
                    type="button"
                    data-press
                    disabled={busy !== null}
                    onClick={() => void answer(request.id, 'declined')}
                    className="border-border-strong bg-surface text-fg h-11 flex-1 rounded-[10px] border text-sm font-semibold disabled:opacity-45"
                  >
                    {t.decline}
                  </button>
                </div>
              ) : (
                <p
                  className={`bg-bg-muted mt-3 rounded-[10px] px-3 py-2.5 text-xs font-semibold ${
                    verdict === 'approved' ? 'text-success-700' : 'text-danger-700'
                  }`}
                >
                  {verdict === 'approved' ? t.approved : t.declined}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** An approval's headline is a figure or a phrase — "126 000" or "1 × Plov". */
function phrase(value: Trilingual | string, lang: Lang): string {
  return typeof value === 'string' ? value : say(value, lang);
}
