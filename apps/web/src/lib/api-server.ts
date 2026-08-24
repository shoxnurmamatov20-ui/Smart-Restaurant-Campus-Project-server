import { cache } from 'react';
import { cookies, headers } from 'next/headers';

import { BRANCH_COOKIE, isBranchRefusal } from './branch-cookie';
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
 * Whether anything on this render fell back to fixtures.
 *
 * `cache()` is per request, not per process — a module-level flag would leak
 * one visitor's degraded render into the next person's page. React gives every
 * server render its own object here, and the shell reads it after the tree has
 * rendered.
 *
 * It exists because of the failure it prevents. `apiGet` returns `null` on a
 * refusal, a timeout or a restart, every screen quietly draws its fixtures, and
 * a reader is shown invented numbers **presented as real** — an owner reading
 * yesterday's demo revenue as this morning's. Falling back is right; doing it
 * silently is not.
 *
 * A session that was never live is a different thing and is not marked: that
 * console is a demo from the first pixel and `session.live === false` already
 * says so.
 */
const degradedBox = cache(() => ({ live: false, degraded: false }));

/** Called by the shell after the tree has rendered. */
export function renderWasDegraded(): boolean {
  const box = degradedBox();

  return box.live && box.degraded;
}

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

  const box = degradedBox();

  // There is a session, so a fallback from here on is a *failure* rather than
  // the demo console rendering normally.
  box.live = true;

  /*
   * Which venue this read is about.
   *
   * An absent header is the roll-up across every venue, which is what the API
   * means by an absent `X-Branch` and what an owner with no venue chosen is
   * reading. The header is what makes the top bar's switcher real: before it,
   * picking Yunusobod set React state and every figure on the page stayed
   * whatever it had been — one venue's takings under another venue's name.
   *
   * The cookie is a slug and is written only by `POST /api/dashboard/branch`,
   * which checks it against the restaurant's own register first. See
   * ./branch-cookie.ts.
   */
  const branch = store.get(BRANCH_COOKIE)?.value;

  try {
    const answer = await ask<T>(path, token, branch);

    if (answer.ok) return answer.data;

    /*
     * The one refusal worth a second attempt.
     *
     * A cookie outlives the venue it names: a branch is closed, or the reader
     * is pinned to one after the fact, and `ResolveBranch` then answers
     * `branch.mismatch` or `branch.not_found` to EVERY request in the console
     * — every screen at once, on a cookie the reader cannot see. Dropping the
     * header and asking again reads the roll-up, which is the honest fallback
     * and the state a person with no venue chosen is in anyway.
     *
     * Deliberately narrowed to those two codes rather than to "a 403". A
     * permission refusal must NOT be retried unscoped: the reason it was
     * refused has nothing to do with the venue, and a second request would
     * only be a second refusal one screen later.
     */
    if (branch !== undefined && isBranchRefusal(answer.body)) {
      const again = await ask<T>(path, token, undefined);

      if (again.ok) return again.data;
    }

    box.degraded = true;

    return null;
  } catch {
    box.degraded = true;

    return null;
  }
}

/**
 * One attempt, with or without the venue header.
 *
 * Split out so the retry above is the same request rather than a second
 * spelling of it. The refused body travels back with the failure because the
 * caller has to read `error.code` to decide whether retrying is honest.
 */
async function ask<T>(
  path: string,
  token: string,
  branch: string | undefined,
): Promise<{ ok: true; data: T } | { ok: false; body: unknown }> {
  const response = await fetch(`${apiBase()}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(branch === undefined || branch === '' ? {} : { 'X-Branch': branch }),
    },
    // A screen is per person and per request: cached, one restaurant's
    // figures would be served to the next request that looked similar.
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // 401 and 403 are answers, not errors: the token expired, or this role does
  // not hold the permission. Both mean "no data", and the guard has already
  // decided the screen should not have been reachable in the second case.
  if (!response.ok) {
    // The envelope, when there is one. A refusal with no JSON body is not a
    // branch refusal, and `null` reads as exactly that at the call site.
    return { ok: false, body: await response.json().catch(() => null) };
  }

  return { ok: true, data: (await response.json()) as T };
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

/**
 * Which restaurant a guest is looking at.
 *
 * The console never asks this — a session token carries its own tenant and
 * `ResolveTenant` reads it off the token. A guest has no token, so the tenant has
 * to come from where they arrived: the QR code put it in the path
 * (`/qr/<restaurant>/<table>`), a branded customer app is one restaurant by
 * definition, and a subdomain names it directly.
 *
 * Resolved in that order, and the order is the point. An explicit segment beats a
 * host, because the same host serves every restaurant's QR codes; a host beats the
 * default, because the default exists only so a single-tenant deployment does not
 * have to configure anything. Getting this backwards would show one restaurant's
 * menu to another's guests, which is the failure the whole tenancy layer exists to
 * prevent — and on the one surface with no login to catch it.
 */
export async function guestTenant(explicit?: string): Promise<string | null> {
  if (explicit !== undefined && explicit !== '') return explicit;

  const host = (await headers()).get('host') ?? '';
  const label = host.split(':')[0]?.split('.')[0] ?? '';

  // `www` and a bare IP are not restaurant names. Neither is a single label with
  // no dots — that is a LAN hostname, not a subdomain.
  if (label !== '' && label !== 'www' && host.includes('.') && !/^\d+$/.test(label)) {
    return label;
  }

  return process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? null;
}

/**
 * Reading a guest-facing endpoint — no session, no bearer token.
 *
 * `apiGet()` cannot serve these. It reads the session cookie and returns `null`
 * the moment there is none, which for a guest is always: the QR menu and the
 * customer app would sit on their fixtures forever, looking like they worked.
 *
 * What replaces the bearer is `X-Tenant`. The endpoints under `/public/*` need no
 * login and are still scoped to one restaurant and to what is actually on sale —
 * that scoping is the header, so sending the wrong one is the whole risk, which is
 * why the tenant is resolved by `guestTenant()` above rather than by each caller.
 *
 * Cached rather than `no-store`, unlike every other read in this app. The public
 * menu is the busiest endpoint the platform has — every guest at every table opens
 * it, more than once — and it answers with an ETag and a 60-second TTL precisely
 * so it can be. A no-store here would throw away the one optimisation the API was
 * built around.
 */
export async function apiPublicGet<T>(path: string, tenant?: string): Promise<T | null> {
  const slug = await guestTenant(tenant);

  if (slug === null) return null;

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', 'X-Tenant': slug },
      // Matches the endpoint's own TTL. A guest reloading the menu twice in a
      // minute is one request, which is the difference between a phone on a slow
      // connection redrawing instantly and waiting for a payload it already has.
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Deliberately *not* marked degraded. The guest surfaces have their own
    // "the menu is a sample" line, and a console banner about a public read is
    // a banner about somebody else's page.
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
