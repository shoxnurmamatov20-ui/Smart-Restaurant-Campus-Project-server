import { cookies } from 'next/headers';

import { apiBase, SESSION_COOKIE } from './server-session';

/**
 * Reading the API from a server component.
 *
 * Every console screen renders on the server, so every screen that wants real
 * data wants this: the session token comes off the httpOnly cookie, the request
 * carries it as a bearer, and the answer comes back typed.
 *
 * It never throws and it never returns half an answer. `null` means "no real
 * data this render" — no session, an expired token, an API mid-restart, a shape
 * that did not parse — and every caller treats that the same way: fall back to
 * the fixtures the screen was built against. A console that 500s because the
 * API is restarting is worse than one showing last week's demo numbers with
 * `session.live === false` next to them.
 *
 * That fallback is the reason this returns `null` instead of throwing. It is
 * also the reason a screen must never *decide* anything from what comes back —
 * what a person may see is settled by the API against the token, per request,
 * and by middleware.ts before the render begins.
 *
 * Server-only by convention: `next/headers` throws in a client component, and
 * nothing in the browser bundle imports this.
 */

/** How long a screen waits before drawing fixtures instead. */
const TIMEOUT_MS = 4_000;

/**
 * Laravel's paginated envelope. `data` is the page; `meta.total` is the count
 * a screen wants for "34 dishes" — not `data.length`, which is one page of it.
 */
export type Paginated<T> = {
  data: T[];
  meta?: { total?: number; current_page?: number; last_page?: number; per_page?: number };
};

export async function apiGet<T>(path: string): Promise<T | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  // No session means the fixture console, and asking anyway would be a
  // guaranteed 401 on every screen of it.
  if (token === undefined) return null;

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      // A screen is per person and per request: cached, one restaurant's
      // figures would be served to the next request that looked similar.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 401 and 403 are answers, not errors: the token expired, or this role does
    // not hold the permission. Both mean "no data", and the guard has already
    // decided the screen should not have been reachable in the second case.
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The `{uz, ru, en}` column every user-facing name is stored in.
 *
 * Falls through to whichever language is present rather than rendering an
 * empty cell: a dish named only in Uzbek should still be legible to someone
 * reading the console in English.
 */
export type Translated = Partial<Record<'uz' | 'ru' | 'en', string>>;

export function translate(value: Translated | string | null | undefined, locale: string): string {
  if (typeof value === 'string') return value;
  if (!value) return '';

  return value[locale as 'uz'] ?? value.uz ?? value.ru ?? value.en ?? '';
}
