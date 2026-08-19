'use client';

import { useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';

import type { Messages } from '@/i18n';

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
 * The denominations are the notes actually in circulation in Uzbekistan; there
 * is deliberately no coin row, because there are no coins.
 *
 * Money is integer tiyin the whole way through. The notes are written here in
 * so'm because that is what is printed on them, and multiplied up once — a
 * screen that divided by 100 anywhere would be one rounding away from a drawer
 * that never reconciles.
 */

/** Notes in circulation, largest first, as the design lists them. */
const NOTES = [200_000, 100_000, 50_000, 10_000, 5_000, 1_000] as const;

/** 1 so'm = 100 tiyin. */
const TIYIN = 100;

export function OpenTill() {
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

  const [counts, setCounts] = useState<Record<number, string>>({});
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pieces = (note: number) => Number.parseInt(counts[note] ?? '', 10) || 0;
  const totalTiyin = NOTES.reduce((sum, note) => sum + note * TIYIN * pieces(note), 0);

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
        setWorking(false);

        return;
      }

      opened();
    } catch {
      setFailed(m.tillOpenFailed);
      setWorking(false);
    }
  }

  return (
    <div className="bg-bg-subtle flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-surface w-full max-w-[520px] rounded-[20px] border p-7">
        <h1 className="font-display tracking-snug text-2xl leading-tight font-bold">
          {m.tillOpenTitle}
        </h1>
        <p className="text-fg-muted mt-2.5 text-sm leading-normal">{m.tillOpenHint}</p>

        <div className="border-divider text-fg-subtle text-2xs mt-7 grid grid-cols-[1fr_96px_1fr] gap-3 border-b pb-2 font-semibold tracking-[0.06em] uppercase">
          <span>{m.tillNominal}</span>
          <span className="text-center">{m.tillPieces}</span>
          <span className="text-right">{m.tillRowSum}</span>
        </div>

        {NOTES.map((note) => {
          const count = pieces(note);

          return (
            <label
              key={note}
              className="border-divider grid grid-cols-[1fr_96px_1fr] items-center gap-3 border-b py-2.5 last:border-0"
            >
              <span data-num className="text-md font-semibold tabular-nums">
                {formatTiyinAmount(note * TIYIN, locale)}
              </span>

              <input
                value={counts[note] ?? ''}
                onChange={(event) =>
                  setCounts((current) => ({
                    ...current,
                    // Digits only. A tablet keyboard offers a decimal point and
                    // a minus sign, and neither is a number of banknotes.
                    [note]: event.target.value.replace(/\D/g, '').slice(0, 4),
                  }))
                }
                inputMode="numeric"
                disabled={working}
                aria-label={`${formatTiyinAmount(note * TIYIN, locale)} · ${m.tillPieces}`}
                className="border-border text-md h-12 rounded-[10px] border text-center font-semibold tabular-nums"
              />

              <span
                data-num
                className={`text-md text-right tabular-nums ${count > 0 ? '' : 'text-fg-subtle'}`}
              >
                {count > 0 ? formatTiyinAmount(note * TIYIN * count, locale) : '—'}
              </span>
            </label>
          );
        })}

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
