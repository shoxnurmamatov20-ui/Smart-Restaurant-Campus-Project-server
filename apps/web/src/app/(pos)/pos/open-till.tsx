'use client';

import { useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';
import { flash } from '@restaurant/ui';

import { countTotal, NoteCount, type NoteCounts } from '@/components/note-count';
import type { Messages } from '@/i18n';
import type { CashLadder } from '@/lib/cash-notes';

/**
 * Counting the float into the drawer.
 *
 * The float is counted by note and never typed as a total, which is the design's
 * choice and the right one: a cashier standing at an open drawer has banknotes
 * in their hand, not a sum in their head. Typing "480 000" is a guess anybody
 * can make without opening the drawer at all, and it is the number every Z
 * report is later reconciled against — so the count has to be the thing that
 * produces it.
 *
 * The denominations are handed in rather than written here, and that is the
 * whole point of the prop. This screen shipped with six of Uzbekistan's eight
 * notes — 20 000 and 2 000 were missing — so a cashier holding either had no
 * row to count it into. The float came out short, and a short float is a drawer
 * that reads short all evening with the cashier's name against it. The server
 * owns the ladder now (`GET /finance/denominations`), which also means this
 * screen cannot offer a row the server would refuse when the count is posted.
 *
 * Money is integer tiyin the whole way through, including the notes: the ladder
 * arrives in tiyin and is never divided or multiplied here. A screen that
 * converted anywhere would be one rounding away from a drawer that never
 * reconciles.
 */

export function OpenTill({ ladder }: { ladder: CashLadder }) {
  /*
   * What happens after the drawer is open is a full reload, not a callback.
   *
   * The parent is a server component and cannot hand a client one a function;
   * more to the point, what has to change is a decision the server makes from
   * the session it re-reads — the cash shift now exists — and only the next
   * request can see it.
   */
  const opened = () => window.location.assign('/pos');

  /*
   * Skipping has to be remembered, or the reload lands on this same screen —
   * a loop with no way out but signing out.
   *
   * A session cookie with no max-age: it dies with the browser and is cleared
   * when the till is handed back, so the next person is asked again. Set from
   * here rather than through a handler because it is not a credential —
   * forging it skips a screen the button already skips.
   */
  const skip = () => {
    document.cookie = 'restaurant-campus-till-skipped=1; path=/; samesite=lax';
    opened();
  };

  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  const locale = useLocale() as 'uz' | 'ru' | 'en';

  const [counts, setCounts] = useState<NoteCounts>({});
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const totalTiyin = countTotal(ladder.notes, counts);

  async function open() {
    if (totalTiyin <= 0 || working) return;

    setWorking(true);
    setFailed(null);

    try {
      const response = await fetch('/api/pos/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_cash: totalTiyin }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setFailed(body?.message ?? m.tillOpenFailed);
        flash.problem(body?.message ?? m.tillOpenFailed);
        setWorking(false);

        return;
      }

      /*
       * The float, read back — `dc.html:16167`.
       *
       * The screen it hands over to says nothing about the drawer, so without
       * this the cashier who has just counted six denominations note by note
       * gets no confirmation of the figure they counted to. It is also the
       * number the Z report will be measured against at midnight.
       */
      flash(m.tillOpened.replace('{sum}', formatTiyinAmount(totalTiyin, locale)));
      opened();
    } catch {
      setFailed(m.tillOpenFailed);
      flash.problem(m.tillOpenFailed);
      setWorking(false);
    }
  }

  return (
    <div className="bg-bg-subtle flex min-h-dvh items-center justify-center p-6">
      <div className="border-border bg-surface w-full max-w-[520px] rounded-[20px] border p-7">
        <h1 className="font-display tracking-snug text-2xl leading-tight font-bold">
          {m.tillOpenTitle}
        </h1>
        <p className="text-fg-muted mt-2.5 text-sm leading-normal">{m.tillOpenHint}</p>

        <div className="mt-7">
          <NoteCount
            notes={ladder.notes}
            counts={counts}
            onChange={setCounts}
            labels={{ note: m.tillNominal, pieces: m.tillPieces, sum: m.tillRowSum }}
            disabled={working}
          />
        </div>

        <div className="border-border mt-5 flex items-baseline justify-between border-t pt-4">
          <span className="text-md font-semibold">{m.tillTotal}</span>
          <span data-num className="font-display text-2xl font-bold tabular-nums">
            {formatTiyinAmount(totalTiyin, locale)}{' '}
            <span className="text-fg-subtle text-md font-normal">{m.som}</span>
          </span>
        </div>

        {failed !== null ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 mt-5 rounded-[12px] px-4 py-3 text-sm font-medium"
          >
            {failed}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void open()}
          disabled={totalTiyin <= 0 || working}
          className="bg-brand-500 rounded-pill mt-6 flex h-[56px] w-full items-center justify-center text-lg font-semibold text-white disabled:opacity-40"
        >
          {working ? m.tillOpenWorking : m.tillOpenSubmit}
        </button>

        {totalTiyin <= 0 ? (
          <p className="text-fg-subtle mt-3 text-center text-xs">{m.tillCountFirst}</p>
        ) : null}

        {/*
         * A way past this screen, because refusing to let somebody work until
         * they have counted a drawer is wrong: a cashier can take card-only
         * orders, and a manager stepping in to fix one bill has no float to
         * count. The API refuses the cash tender itself when no shift is open,
         * which is the check that actually matters and is in the right place.
         */}
        <button
          type="button"
          onClick={skip}
          disabled={working}
          className="text-fg-muted mt-2 h-11 w-full text-sm font-semibold"
        >
          {m.tillSkip}
        </button>
      </div>
    </div>
  );
}
