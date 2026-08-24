'use client';

import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

/**
 * "Try this invoice again", on a platform that charges nobody automatically.
 *
 * What the button does is count the attempt and, at three, move the row to
 * `overdue` — which is exactly what the failing figure above the table counts.
 * There is no gateway behind it and there is not meant to be: nobody's card is
 * on file here, an operator reconciles the bank statement, and a product that
 * pretended to charge would show "failing" for a restaurant that paid last
 * week. The count is the dunning ladder, and the ladder is walked by a person.
 *
 * A client component for one control, because the page around it is a server
 * component and a click has to reach a route handler with the operator's own
 * token behind it — see `lib/console-post.ts` for why the browser never holds
 * that token.
 *
 * `invoiceId` is the row's numeric key and `null` means this render fell back
 * to fixtures: the printed number is a string the demo console made up, and an
 * attempt counted against a guessed id would be counted against somebody
 * else's bill.
 */
export function RetryButton({
  invoiceId,
  lang,
  label,
  done,
  failed,
  demo,
  className,
}: {
  invoiceId: number | null;
  /** Which of the envelope's three sentences a refusal is shown in. */
  lang: 'uz' | 'ru' | 'en';
  label: string;
  /** What the operator is told when the attempt was recorded. */
  done: string;
  failed: string;
  /** What they are told instead when there is no server behind this row. */
  demo: string;
  className?: string;
}) {
  async function retry() {
    if (invoiceId === null) {
      flash.problem(demo);

      return;
    }

    const answer = await post('/api/platform/billing', { action: 'retry', invoiceId }, lang);

    if (!answer.ok) {
      flash.problem(answer.message ?? failed);

      return;
    }

    flash(done);
  }

  return (
    <button type="button" onClick={() => void retry()} className={className}>
      {label}
    </button>
  );
}
