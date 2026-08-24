'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post, type Lang } from '@/lib/console-post';

/**
 * One press that turns a review into something somebody has to answer.
 *
 * The seam the CRM screen was missing. A review is a score, a comment and an
 * aspect; a complaint carries the channel it arrived on, the order it disputes,
 * the amount in dispute, which of the four answers was given and who gave it —
 * five things `crm.feedbacks` has no columns for. So this is not a status
 * change on the review, it is a row in a different table, and the review's own
 * words, guest and order number move across with it rather than being retyped.
 *
 * The button disappears once it has been pressed, which is the honest end
 * state: the desk is open, and opening it again returns the same one.
 */
export function OpenCase({
  feedbackId,
  lang,
  label,
  done,
}: {
  /** The review's id, or `null` for a fixture row with nothing upstream. */
  feedbackId: number | null;
  lang: Lang;
  label: string;
  /** What the toast says once the desk is open, in the reader's language. */
  done: string;
}) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);

  if (opened) return null;

  return (
    <button
      type="button"
      data-press
      disabled={busy}
      onClick={async () => {
        setBusy(true);

        // A fixture row: nothing upstream to aim at. The button still answers,
        // so a demo console is not a broken one.
        if (feedbackId === null) {
          setOpened(true);
          setBusy(false);
          flash(done);

          return;
        }

        const sent = await post<unknown>(
          '/api/crm',
          { action: 'case-from-feedback', id: feedbackId },
          lang,
        );

        setBusy(false);

        if (!sent.ok) {
          flash.problem(sent.message ?? label);

          return;
        }

        setOpened(true);
        flash(done);
      }}
      className="border-border-strong bg-surface hover:bg-bg-muted text-2xs rounded-md border px-2 py-1 font-semibold disabled:opacity-50"
    >
      {label}
    </button>
  );
}
