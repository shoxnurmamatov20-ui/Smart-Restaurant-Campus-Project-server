'use client';

import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { apiId, post } from '@/lib/console-post';

import { som } from '../../../(guest)/guest-session';
import { merchantCopy } from '../../merchant-copy';
import {
  DISPUTE_KPIS,
  DISPUTE_TEXT,
  DISPUTES,
  NOT_SAVED,
  say,
  type Dispute,
  type Lang,
} from '../../merchant-data';

/**
 * Disputes — `Do'kon paneli.dc.html:383-430`.
 *
 * The panel drew four figures, four rules and **no disputes**, under a heading
 * that was the empty state's own sentence: a merchant with two open complaints
 * opened this screen and read "Ochiq nizo yo‘q". The heading now comes from the
 * header, the empty state is drawn only when it is true, and the three cards
 * the design specifies are here.
 *
 * **Each card is an argument the merchant has to answer.** The guest's own
 * words in quotation marks, whether they attached photographs, the amount at
 * stake, and — the line that decides it — what happens on each of the two
 * buttons. "Accept" is not "yes"; it means the amount is withheld from
 * Thursday's payout and the commission is reversed. A dispute screen that
 * offers two buttons without saying which one costs what is a screen that gets
 * pressed at random.
 *
 * The clock is amber over eight hours and red under, because a dispute nobody
 * answers inside twenty-four is settled for the guest automatically — the first
 * of the four rules underneath.
 */
const KPI_TONE = {
  success: 'text-success-700',
  neutral: 'text-fg-subtle',
  danger: 'text-danger-600',
} as const;

export function DisputesBoard({
  lang,
  disputes = DISPUTES,
  live = false,
}: {
  lang: Lang;
  /** Complaints, read through `merchant-server.ts`. */
  disputes?: readonly Dispute[];
  /**
   * Whether these rows are this restaurant's or the design's sample.
   *
   * Marked rather than left to be guessed at: a payout screen showing invented
   * figures as real is a merchant reconciling a bank account against nothing.
   */
  live?: boolean;
}) {
  const money = (tiyin: number) => som(tiyin, lang);
  const t = merchantCopy(lang);

  const [settled, setSettled] = useState<Record<string, 'accepted' | 'contested'>>({});

  const stateOf = (id: string, fallback?: 'accepted' | 'contested') => settled[id] ?? fallback;

  /*
   * The restaurant's answer, sent once.
   *
   * The card settles before the answer comes back and **stays settled** — the
   * opposite of the accept queue next door, and for the reason the queue's own
   * comment gives: nothing here is counting down in ninety seconds. A dispute
   * has hours on it, the API refuses a second answer on the same complaint, and
   * a card that jumped back would invite exactly that second press. A refusal
   * says so in the toast, which is where the merchant is already looking.
   */
  function answer(id: string, verdict: 'accepted' | 'contested', told: string) {
    setSettled((now) => ({ ...now, [id]: verdict }));

    const real = apiId(id);

    /* A sample complaint — the design's carry `d1`, `d2`. */
    if (real === null) {
      flash(told);

      return;
    }

    void post(`/api/marketplace/disputes/${real}`, { state: verdict }, lang).then((sent) => {
      if (sent.ok) {
        flash(told);

        return;
      }

      flash.problem(sent.message ?? say(NOT_SAVED, lang));
    });
  }

  const open = disputes.filter(
    (dispute) => stateOf(dispute.id, dispute.resolved) === undefined,
  ).length;

  return (
    <>
      {/*
        The whole screen, marked when it is drawing the design's sample rather
        than this restaurant's rows. On the wrapper rather than on one card,
        because "these figures are not yours" is true of everything below it —
        and a merchant panel that quietly shows six invented orders is a
        merchant cooking six dinners nobody ordered.
      */}
      <div data-demo={live ? undefined : ''} className="contents">
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DISPUTE_KPIS.map((kpi) => (
            <div
              key={kpi.key}
              className="border-border bg-surface rounded-[14px] border px-4.5 py-4"
            >
              <p className="text-fg-subtle text-xs font-medium">{say(kpi.label, lang)}</p>
              <p
                data-num
                className="font-display mt-1.5 text-[30px] leading-[1.05] font-bold tracking-tight"
              >
                {/* The first figure is the live count rather than a fixture: it
                    is the one number on this screen the merchant changes. */}
                {kpi.key === 'open' ? String(open) : say(kpi.value, lang)}
              </p>
              <p className={`mt-1 text-xs font-medium ${KPI_TONE[kpi.tone]}`}>
                {say(kpi.note, lang)}
              </p>
            </div>
          ))}
        </div>

        {open === 0 ? (
          <div className="border-border bg-surface rounded-[14px] border px-6 py-11 text-center">
            <p className="text-[15px] font-semibold">{t.text.dspEmptyH}</p>
            <p className="text-fg-subtle mt-1 text-[13px] leading-normal">{t.text.dspEmptyP}</p>
          </div>
        ) : null}

        <div className="grid gap-3">
          {disputes.map((dispute) => {
            const state = stateOf(dispute.id, dispute.resolved);
            const urgent = dispute.hoursLeft <= 8;

            const edge =
              state === 'accepted'
                ? 'border-l-success-500'
                : state === 'contested'
                  ? 'border-l-brand-500'
                  : urgent
                    ? 'border-l-danger-500'
                    : 'border-l-warning-500';

            const chip =
              state === 'accepted'
                ? 'bg-success-50 text-success-700'
                : state === 'contested'
                  ? 'bg-brand-50 text-brand-700'
                  : urgent
                    ? 'bg-danger-50 text-danger-700'
                    : 'bg-warning-50 text-warning-700';

            return (
              <article
                key={dispute.id}
                className={`bg-surface rounded-[14px] border border-l-[3px] px-5 py-4.5 ${edge}`}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className={`rounded-pill px-2.5 py-[3px] text-[11px] font-bold ${chip}`}>
                    {state === undefined
                      ? say(dispute.kind, lang)
                      : say(
                          state === 'accepted' ? DISPUTE_TEXT.accepted : DISPUTE_TEXT.contested,
                          lang,
                        )}
                  </span>

                  <span data-num className="text-fg-muted font-mono text-xs">
                    {dispute.number}
                  </span>

                  <span className="flex-1" />

                  <span
                    data-num
                    className={`text-xs font-semibold ${
                      state !== undefined
                        ? 'text-fg-subtle'
                        : urgent
                          ? 'text-danger-600'
                          : 'text-warning-700'
                    }`}
                  >
                    {state !== undefined
                      ? say(DISPUTE_TEXT.closed, lang)
                      : say(DISPUTE_TEXT.hoursLeft, lang).replace('{n}', String(dispute.hoursLeft))}
                  </span>
                </div>

                <div className="mt-3 grid items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="min-w-0">
                    <p className="font-display text-base font-bold tracking-tight">
                      {say(dispute.title, lang)}
                    </p>
                    <p className="text-fg-muted mt-1 text-[13px] leading-relaxed">
                      {say(dispute.body, lang)}
                    </p>

                    {/* The guest, in their own words. A paraphrase is the store's
                        version of the complaint; the quote is the complaint. */}
                    <div className="bg-bg-muted mt-3 flex items-start gap-2.5 rounded-[10px] px-3.5 py-3">
                      <span className="border-border bg-surface text-fg-muted grid size-[26px] flex-none place-items-center rounded-full border text-[10px] font-bold">
                        {dispute.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">{dispute.who}</span>
                        <span className="text-fg-muted mt-0.5 block text-xs leading-normal">
                          {say(dispute.quote, lang)}
                        </span>
                      </span>
                    </div>

                    {dispute.photos === undefined ? null : (
                      <p className="text-fg-subtle mt-2.5 flex items-center gap-2 text-xs">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          className="flex-none"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle cx="8.5" cy="10" r="1.5" />
                          <path d="m21 16-5-5-9 8" />
                        </svg>
                        {say(dispute.photos, lang)}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="bg-bg-muted rounded-xl px-4 py-3.5">
                      <p className="text-fg-subtle text-[11px]">{t.text.dspAtStake}</p>
                      <p
                        data-num
                        className="font-display mt-1 text-[22px] leading-none font-bold tracking-tight"
                      >
                        {money(dispute.amount)}
                      </p>
                      {/* What each button costs, before either is pressed. */}
                      <p className="text-fg-subtle mt-1.5 text-[11px] leading-normal">
                        {say(dispute.split, lang)}
                      </p>
                    </div>

                    {state === undefined ? (
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            answer(dispute.id, 'accepted', say(DISPUTE_TEXT.acceptFlash, lang))
                          }
                          data-press
                          className="bg-brand-500 h-[42px] w-full rounded-[10px] text-[13px] font-semibold text-white"
                        >
                          {t.text.dspAccept}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            answer(dispute.id, 'contested', say(DISPUTE_TEXT.contestFlash, lang))
                          }
                          className="border-border-strong bg-surface h-[42px] w-full rounded-[10px] border text-[13px] font-semibold"
                        >
                          {t.text.dspContest}
                        </button>
                      </div>
                    ) : (
                      <p
                        className={`bg-bg-muted mt-3 rounded-[10px] px-3.5 py-3 text-xs leading-normal font-semibold ${
                          state === 'accepted' ? 'text-success-700' : 'text-brand-700'
                        }`}
                      >
                        {say(
                          state === 'accepted'
                            ? DISPUTE_TEXT.acceptedNote
                            : DISPUTE_TEXT.contestedNote,
                          lang,
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <p className="text-fg-subtle tracking-caps mt-6 mb-2.5 text-xs font-semibold uppercase">
          {t.text.dspRulesH}
        </p>

        <ul className="border-border bg-surface overflow-hidden rounded-[14px] border">
          {t.disputeRules.map((rule) => (
            <li
              key={rule.label}
              className="border-divider text-fg-muted flex items-start gap-2.5 border-b px-5 py-3.5 text-[13px] leading-relaxed last:border-0"
            >
              <span
                aria-hidden
                className="bg-border-strong mt-2 size-[5px] flex-none rounded-full"
              />
              {rule.label}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
