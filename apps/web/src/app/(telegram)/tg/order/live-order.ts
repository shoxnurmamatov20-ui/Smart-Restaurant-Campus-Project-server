'use client';

import { useEffect, useState } from 'react';

import { TG_LADDER, type TgStep } from '@restaurant/surfaces/tg/data';

import { tgGet, useTgSession } from '../../tg-session';

/**
 * The guest's own order, tracked inside Telegram.
 *
 * The board drew `TG_ORDER` — #4471, en route, courier "A.T." — to everyone
 * who opened it. A guest signed in through Telegram's signature can be asked
 * `GET /public/orders`, which answers their orders and nobody else's; the
 * newest one that has not been handed over is the one they opened this
 * screen to watch.
 *
 * Null with a reason rather than a fixture: "nothing on the way" is a real
 * answer to "where is my order", and it is the answer most of the time.
 */
export type LiveOrder = {
  number: string;
  state: TgStep;
  /** `HH:mm` per step, as far as the order has come. */
  times: Partial<Record<TgStep, string>>;
  totalTiyin: number | null;
};

type ApiOrder = {
  number?: string;
  status?: string;
  total?: number;
  placed_at?: string | null;
  accepted_at?: string | null;
  ready_at?: string | null;
  handed_at?: string | null;
  closed_at?: string | null;
};

/** The API's lifecycle against the five steps the mini app draws. */
const STEP_OF: Readonly<Record<string, TgStep>> = {
  placed: 'accepted',
  accepted: 'accepted',
  cooking: 'cooking',
  ready: 'ready',
  enroute: 'enroute',
  delivering: 'enroute',
  served: 'handed',
  handed: 'handed',
  paid: 'handed',
  closed: 'handed',
};

const clock = (iso: string | null | undefined): string | undefined =>
  typeof iso === 'string' && iso !== '' ? iso.slice(11, 16) : undefined;

export function orderFrom(rows: readonly ApiOrder[]): LiveOrder | null {
  const live = rows.find((row) => {
    const step = STEP_OF[String(row.status)];

    return step !== undefined && step !== 'handed';
  });

  const row = live ?? rows[0];

  if (row === undefined || typeof row.number !== 'string') return null;

  const times: Partial<Record<TgStep, string>> = {};
  const at = (step: TgStep, iso: string | null | undefined): void => {
    const time = clock(iso);
    if (time !== undefined) times[step] = time;
  };

  at('accepted', row.accepted_at ?? row.placed_at);
  at('ready', row.ready_at);
  at('handed', row.handed_at ?? row.closed_at);

  return {
    number: row.number.startsWith('#') ? row.number : `#${row.number}`,
    state: STEP_OF[String(row.status)] ?? 'accepted',
    times,
    totalTiyin: typeof row.total === 'number' ? row.total : null,
  };
}

/** How far along the ladder this order has come. */
export function reachedIndex(state: TgStep): number {
  return TG_LADDER.indexOf(state);
}

export type TrackState =
  | { state: 'loading' }
  /** Opened outside Telegram, or the restaurant has no bot. */
  | { state: 'outside'; reason: 'no_telegram' | 'not_configured' | 'refused' }
  /** Signed in, and nothing on the way — the usual answer. */
  | { state: 'none' }
  | { state: 'order'; order: LiveOrder };

export function useLiveOrder(): TrackState {
  const session = useTgSession();
  const [fetched, setFetched] = useState<TrackState | null>(null);

  useEffect(() => {
    if (session.state !== 'ready') return;

    let cancelled = false;

    void tgGet<{ data?: ApiOrder[] }>(session.token, '/public/orders?per_page=5').then((answer) => {
      if (cancelled) return;

      const order = orderFrom(answer?.data ?? []);

      setFetched(order === null ? { state: 'none' } : { state: 'order', order });
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Derived rather than stored: the two states the session already knows are
  // read straight off it, and only the fetch needs state of its own. Setting
  // state inside the effect for them would render twice for a fact that was
  // available on the first pass.
  if (session.state === 'unavailable') return { state: 'outside', reason: session.reason };
  if (session.state === 'loading') return { state: 'loading' };

  return fetched ?? { state: 'loading' };
}
