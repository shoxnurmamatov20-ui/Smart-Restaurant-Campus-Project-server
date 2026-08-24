'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { realtime } from './realtime';
import type { RealtimeConfig } from './realtime-server';

/**
 * What a board does while the socket is not carrying events: asks again.
 *
 * The socket is the normal path, and the boards are written for it — a ticket
 * fired in the kitchen lands on the wall screen in the same second. But a
 * WebSocket is also the one thing in this stack that something in front of the
 * box can refuse without anybody noticing: the edge the public domain goes
 * through speaks HTTP/1.0 to us and drops `Upgrade`, so the handshake comes
 * back 500, pusher-js retries forever, and the board renders, looks alive (its
 * timers tick) and never learns about a new order. A kitchen that does not
 * move on its own is a kitchen reading the wrong screen.
 *
 * So while the link is anything but `connected`, the page re-reads its server
 * data every `everyMs`, and once more whenever the tab becomes visible again —
 * a tablet coming back from sleep has missed a lot, and it should not wait one
 * more interval to catch up. When the link connects, polling stops: the
 * events are enough, and a request every few seconds from every screen in the
 * building is exactly the load a socket exists to avoid.
 *
 * `router.refresh()` rather than a fetch per board: it re-runs the server
 * components with fresh data and leaves client state — the cart, the open
 * panel, the selected column — where it was. Each board then adopts the new
 * server snapshot when its props change, see `adopt()` at the call sites.
 */

/** The part of pusher-js's connection this file reads. */
export interface Link {
  readonly state: string;
  bind(event: 'state_change', handler: (change: { current: string }) => void): unknown;
  unbind(event: 'state_change', handler: (change: { current: string }) => void): unknown;
}

/** A document, for `visibilitychange`; null in tests and on the server. */
export interface Page {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', handler: () => void): void;
  removeEventListener(type: 'visibilitychange', handler: () => void): void;
}

/**
 * Calls `refetch` every `everyMs` while `link` is not connected (a null link is
 * never connected), and once when the page becomes visible. Returns the stop
 * function.
 */
export function pollWhileOffline(
  link: Link | null,
  refetch: () => void,
  everyMs: number,
  page: Page | null,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    if (timer === null) timer = setInterval(refetch, everyMs);
  };

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const onState = ({ current }: { current: string }) => {
    if (current === 'connected') stop();
    else start();
  };

  const onVisible = () => {
    if (page?.visibilityState === 'visible') refetch();
  };

  if (link === null || link.state !== 'connected') start();
  link?.bind('state_change', onState);
  page?.addEventListener('visibilitychange', onVisible);

  return () => {
    stop();
    link?.unbind('state_change', onState);
    page?.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * The link pusher-js keeps for `realtime()`'s socket, or null when realtime is
 * not configured at all — in which case the board polls for as long as it is
 * open, which is the honest behaviour for a box with no socket server.
 */
function linkOf(config: RealtimeConfig | null): Link | null {
  const echo = realtime(config);

  if (echo === null) return null;

  return echo.connector.pusher.connection as unknown as Link;
}

/** Re-reads this page's server data while the socket is not connected. */
export function usePollWhileOffline(config: RealtimeConfig | null, everyMs: number): void {
  const router = useRouter();

  useEffect(
    () => pollWhileOffline(linkOf(config), () => router.refresh(), everyMs, document),
    [config, everyMs, router],
  );
}

/**
 * Adopts a new server snapshot into board state.
 *
 * A board seeds its state from props once and then moves it by events; after
 * `router.refresh()` the props are a fresh snapshot the state knows nothing
 * about. This is React's own pattern for it — compare against the last
 * snapshot seen and reset during render, not in an effect, so the board never
 * paints one frame of the stale list first.
 */
export function adopt<T>(
  snapshot: T,
  seen: T,
  setSeen: (value: T) => void,
  setState: (value: T) => void,
): void {
  if (seen !== snapshot) {
    setSeen(snapshot);
    setState(snapshot);
  }
}
