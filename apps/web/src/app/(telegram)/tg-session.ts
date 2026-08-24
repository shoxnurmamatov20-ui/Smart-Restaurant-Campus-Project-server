'use client';

import { useEffect, useState } from 'react';

/**
 * Who is holding the phone, inside Telegram.
 *
 * The mini app runs in Telegram's WebView, which hands the page a signed
 * `initData` on `window.Telegram.WebApp`. That string is exchanged once for a
 * customer token — the same token the customer app gets after an SMS code —
 * and every read after it is the guest's own: their points, their orders.
 *
 * Why the exchange happens in the browser rather than on the server: the
 * signature lives in the WebView's own global and never reaches the server
 * render. The token that comes back is kept in `sessionStorage` for the life
 * of the mini app — not a cookie, because Telegram opens the page in an
 * embedded browser whose cookie behaviour differs between iOS, Android and
 * desktop, and not `localStorage`, because a phone lent to somebody else
 * should not hand over an account.
 *
 * A page opened outside Telegram gets `unavailable` and the screen says so.
 * That is the state a crawler and a curious browser see, and it is honest:
 * without a signature there is nobody to be.
 */

const KEY = 'tg.session';

export type TgSession =
  | { state: 'loading' }
  /** Not inside Telegram, or the restaurant has no bot: nothing to show. */
  | { state: 'unavailable'; reason: 'no_telegram' | 'not_configured' | 'refused' }
  | { state: 'ready'; token: string };

type WebApp = { initData?: string };

function telegramInitData(): string | null {
  const app = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
  const data = app?.initData;

  return typeof data === 'string' && data !== '' ? data : null;
}

export function useTgSession(): TgSession {
  const [session, setSession] = useState<TgSession>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const start = async (): Promise<void> => {
      try {
        const kept = window.sessionStorage.getItem(KEY);

        if (kept !== null && kept !== '') {
          setSession({ state: 'ready', token: kept });
          return;
        }
      } catch {
        // A WebView with storage disabled still works, one session at a time.
      }

      const initData = telegramInitData();

      if (initData === null) {
        setSession({ state: 'unavailable', reason: 'no_telegram' });
        return;
      }

      let answer: Response;

      try {
        answer = await fetch('/api/telegram/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
      } catch {
        if (!cancelled) setSession({ state: 'unavailable', reason: 'refused' });
        return;
      }

      if (cancelled) return;

      if (!answer.ok) {
        const body = (await answer.json().catch(() => ({}))) as { error?: string };

        setSession({
          state: 'unavailable',
          reason: body.error === 'telegram.not_configured' ? 'not_configured' : 'refused',
        });
        return;
      }

      const body = (await answer.json()) as { token?: string };

      if (typeof body.token !== 'string' || body.token === '') {
        setSession({ state: 'unavailable', reason: 'refused' });
        return;
      }

      try {
        window.sessionStorage.setItem(KEY, body.token);
      } catch {
        // Kept in memory for this page instead.
      }

      setSession({ state: 'ready', token: body.token });
    };

    void start();

    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}

/** A read on the guest's own behalf, with the token from `useTgSession()`. */
export async function tgGet<T>(token: string, path: string): Promise<T | null> {
  let answer: Response;

  try {
    answer = await fetch(`/api/telegram/read?path=${encodeURIComponent(path)}`, {
      headers: { 'X-Tg-Token': token },
    });
  } catch {
    return null;
  }

  if (!answer.ok) return null;

  return (await answer.json().catch(() => null)) as T | null;
}
