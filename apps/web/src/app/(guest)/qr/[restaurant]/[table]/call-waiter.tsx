'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { fill } from '../../../guest-session';

/**
 * "Call the waiter", which the design puts on two screens and the build put on
 * neither — `Mehmon.dc.html:113-119` and `:379`.
 *
 * The card used to be drawn `aria-disabled` at 45% opacity, on the reasoning
 * that a control which told nobody would leave a guest waiting for somebody who
 * was never called. That reasoning is right about the channel and wrong about
 * the screen: a dead card at the top of the first thing a guest sees reads as a
 * broken app, and it is the second most-pressed thing on this surface.
 *
 * So it presses, it says what it did in the design's own words, and it now
 * actually calls somebody: `POST /api/v1/public/tables/{token}/call` writes the
 * row and broadcasts `tables.guest.called` on `branch.{id}.floor`, which is the
 * handset in the waiter's apron.
 *
 * It still latches — one call per screen — and so does the server, for the same
 * reason from the other side: a guest who taps three times has not called three
 * waiters, and the floor screen must not show three tables' worth of work for
 * one raised hand. The API answers 200 with `already_open: true` rather than
 * opening a second row, so the two latches agree even when this one is reset by
 * a page reload.
 *
 * A failure does NOT unlatch. Reverting the card to "call the waiter" after the
 * network dropped would invite a second tap, and the first request may well have
 * landed — this is the one place on the surface where saying "done" and being
 * wrong is cheaper than saying "failed" and being wrong.
 */
export function CallWaiter({
  waiter,
  copy,
  variant = 'door',
  endpoint,
}: {
  /** Whose section this table is. Named in the flash, as the design names it. */
  waiter: string;
  copy: { title: string; sub: string; called: string; onWay: string; demo: string };
  /** The entry screen draws a card; the status screen draws a plain button. */
  variant?: 'door' | 'button';
  /**
   * Where to send it — `/qr/{restaurant}/{token}/service/call`.
   *
   * Passed in rather than built here, because this component is drawn on two
   * pages and neither of them is under the `[table]` segment as far as a client
   * component is concerned: `useParams()` would work and would also be a second
   * place the URL is spelled. The pages already know it.
   *
   * Optional, so the marketing demo of this card keeps working without one.
   */
  endpoint?: string;
}) {
  const [called, setCalled] = useState(false);

  const call = () => {
    if (called) return;

    /*
     * Latched before the request, not after.
     *
     * The whole point of the latch is the second tap, and a second tap arrives
     * while the first request is still in flight — that is what an impatient
     * guest on café Wi-Fi does. Latching on the response would let both through.
     */
    setCalled(true);
    flash(`${copy.called} · ${fill(copy.onWay, { waiter })}`);

    if (endpoint === undefined) return;

    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {
      // Deliberately silent — see the note above on why a failure does not
      // unlatch. The row either landed or a waiter walks past anyway.
    });
  };

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={call}
        aria-disabled={called}
        className={`border-border bg-surface grid h-[var(--tap-min)] w-full place-items-center rounded-md border text-sm font-semibold ${
          called ? 'opacity-55' : ''
        }`}
      >
        {called ? copy.called : copy.title}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={call}
      aria-disabled={called}
      className={`bg-surface flex min-h-[72px] flex-col justify-center rounded-md border px-4 py-3 text-left ${
        called ? 'border-success-500/40 bg-success-50' : ''
      }`}
    >
      <span className="text-md block leading-snug font-semibold">
        {called ? copy.called : copy.title}
      </span>
      <span className={`mt-0.5 block text-sm ${called ? 'text-success-700' : 'text-fg-subtle'}`}>
        {called ? copy.demo : copy.sub}
      </span>
    </button>
  );
}
