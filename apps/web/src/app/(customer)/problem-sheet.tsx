'use client';

import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { copy, PROBLEM } from '@restaurant/surfaces/customer/copy';
import type { Lang } from '@restaurant/surfaces/customer/data';
import { sendFeedback } from './customer-client';

/**
 * "Muammo bor edi" — the one route out of `GAPS.md §4.1 K3`.
 *
 * Until now nothing in this product let a guest say that something went wrong.
 * A refund existed only as a manager approval at the till, a rating existed
 * only in the Telegram bot's chat keyboard (`Telegram.dc.html:594`), and the
 * customer app's Help row was a sentence explaining that neither was reachable.
 * A gap described is still a gap.
 *
 * Deliberately small. The design gives one button and one outcome — the message
 * reaches a manager and the manager gets in touch — so that is what this is: a
 * button, an optional line of context, and a flash that repeats the promise.
 * No reason taxonomy, no refund amount, no ticket number, because none of those
 * are drawn anywhere and inventing them would be inventing a support product.
 *
 * The note is optional on purpose. A report a guest abandons because it demands
 * an essay is a report the restaurant never receives, and the signal alone —
 * *this order went wrong* — is already more than the platform had.
 *
 * ---------------------------------------------------------------------------
 * It reaches somebody now
 *
 * `POST /api/v1/public/feedback` writes a `crm.feedbacks` row that the console's
 * CRM screen already lists. Signing in is optional on that endpoint and the
 * token rides along when there is one, so a guest at a table can report a
 * problem and a signed-in guest's report lands on their record.
 *
 * The score is a 2 rather than a 1. A report from this sheet is a complaint, and
 * `Feedback::negative()` is `score <= 2` — but a 1 is auto-flagged urgent, and a
 * sheet that marked every report urgent would make the flag mean nothing by
 * Friday. The server still raises it on its own if the words say somebody may
 * be hurt.
 *
 * The flash does not wait for the answer and does not report a failure. The
 * promise the design makes is "a manager will be in touch", not "the row was
 * written", and a guest who has already closed the sheet cannot act on a
 * network error anyway — the honest cost of a lost report is one lost report.
 */
export function ProblemSheet({
  lang,
  /** What the report is about, carried into the message a manager will read. */
  about,
  open,
  onClose,
}: {
  lang: Lang;
  about: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = copy(PROBLEM, lang);
  const [note, setNote] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        data-scrim
        aria-label={t.cancel}
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'rgba(15,19,32,.42)' }}
      />

      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={t.report}
        className="bg-surface relative w-full max-w-[var(--phone-measure)] rounded-t-2xl px-[var(--phone-gutter)] pt-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <h2 className="font-display text-lg font-semibold tracking-tight">{t.report}</h2>
        <p className="text-fg-subtle mt-1 text-xs">{about}</p>

        <textarea
          value={note}
          maxLength={280}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t.reportPlaceholder}
          aria-label={t.reportPlaceholder}
          className="border-border bg-bg-subtle mt-3 w-full resize-none rounded-md border px-3.5 py-3 text-base"
        />

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border h-[var(--tap-lg)] flex-1 rounded-md border text-sm font-semibold"
          >
            {t.cancel}
          </button>

          <button
            type="button"
            onClick={() => {
              // `about` names what went wrong — an order number, a dish — and
              // the note is what the guest wanted to add. Joined, because the
              // console shows one comment column and reading them apart would
              // mean two.
              void sendFeedback(lang, {
                score: 2,
                aspect: 'problem',
                comment: note.trim() === '' ? about : `${about} — ${note.trim()}`,
              });

              setNote('');
              onClose();
              flash(t.sent);
            }}
            className="bg-acc h-[var(--tap-lg)] flex-1 rounded-md text-sm font-semibold text-white"
          >
            {t.send}
          </button>
        </div>
      </div>
    </div>
  );
}
