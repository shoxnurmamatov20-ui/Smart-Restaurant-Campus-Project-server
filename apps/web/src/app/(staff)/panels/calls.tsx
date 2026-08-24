'use client';

import { flash } from '@restaurant/ui';
import { useState } from 'react';

import { CALLS_COPY, copy, FLASH } from '@restaurant/surfaces/crew/copy';
import { CALLS, say, type Call, type CallKind, type Lang } from '@restaurant/surfaces/crew/data';
import { EmptyState, NotWired } from './bits';

/**
 * Everything that is waiting on this waiter, with the plate first.
 *
 * The dish-ready signal is the single most valuable push in the whole
 * ecosystem, and the reason is physical: a plate on the pass loses temperature
 * and appearance every second it sits there, the kitchen has already done all
 * of the work, and the only person who can finish it is somewhere else in the
 * room. A guest call and a bill request can wait a minute; food cannot.
 *
 * So the ready call keeps the green edge and the top of the list, and the timer
 * beside it counts up rather than down — a number that grows is read as a
 * reproach, which is what it should be at 3:00.
 *
 * A client component because marking one done is state. It is state that goes
 * nowhere yet, which the strip above says out loud.
 */
export function CallsPanel({
  lang,
  calls = CALLS,
  live = false,
}: {
  lang: Lang;
  /** The open calls as `crew-server.ts` read them, or the design's three. */
  calls?: readonly Call[];
  live?: boolean;
}) {
  const t = copy(CALLS_COPY, lang);
  const f = copy(FLASH, lang);
  const [done, setDone] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Close the call on the server, and put the card back if it refused.
   *
   * It used to be `setDone` and a toast. Two waiters both tapped it, the
   * kitchen kept chasing the plate, and the card was back on the next reload —
   * because nothing had been written anywhere.
   */
  async function resolve(id: string) {
    setBusy(id);

    try {
      const response = await fetch('/crew/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: Number(id), status: 'done' }),
      });

      if (!response.ok) {
        flash.problem(t.failed);

        return;
      }

      setDone((all) => ({ ...all, [id]: true }));
      flash(f.callMarked);
    } catch {
      flash.problem(t.failed);
    } finally {
      setBusy(null);
    }
  }

  const edge: Record<CallKind, string> = {
    ready: 'border-l-success-500',
    guest: 'border-l-warning-500',
    bill: 'border-l-brand-500',
  };

  const timer: Record<CallKind, string> = {
    ready: 'text-success-600',
    guest: 'text-warning-600',
    bill: 'text-brand-600',
  };

  const open = calls.filter((call) => !done[call.id]);

  return (
    <section>
      <p className="text-fg-muted mb-3.5 text-sm leading-normal">{t.intro}</p>
      {/* The strip used to say the whole panel went nowhere. It goes somewhere
          now; what is left to say is when the cards are the design's. */}
      {live ? null : <NotWired>{t.demoCalls}</NotWired>}

      {open.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {calls.map((call) => {
            const closed = done[call.id] === true;

            return (
              <li
                key={call.id}
                className={`border-border bg-surface rounded-[14px] border border-l-[3px] px-4 py-3.5 ${edge[call.kind]} ${
                  /* A closed card fades rather than disappearing, so a waiter
                     who taps the wrong one can see what they just did. */
                  closed ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <h3 className="text-sm font-semibold">{say(call.title, lang)}</h3>
                  <span data-num className={`text-2xs flex-none font-semibold ${timer[call.kind]}`}>
                    {call.waiting}
                  </span>
                </div>

                <p className="text-fg-muted mt-1 text-xs leading-normal">{say(call.body, lang)}</p>

                {closed ? (
                  <p className="text-fg-subtle mt-2.5 text-xs font-semibold">{t.done}</p>
                ) : (
                  <button
                    type="button"
                    data-press
                    disabled={busy === call.id || !live}
                    onClick={() => void resolve(call.id)}
                    /*
                     * Full width and 44px. This is pressed while walking back
                     * to the pass with a tray in the other hand — a small
                     * target here means the call stays open and the kitchen
                     * chases it.
                     */
                    className="border-border-strong bg-surface text-fg mt-3 h-11 w-full rounded-[10px] border text-sm font-semibold"
                  >
                    {say(call.action, lang)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
