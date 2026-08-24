import { apiBase } from '@/lib/server-session';

import {
  guestMenuFrom,
  type GuestLocale,
  type GuestMenu,
  type GuestMenuPayload,
} from '@restaurant/surfaces/guest/menu-data';

/**
 * The guest menu, from the one endpoint the platform publishes to the public.
 *
 * `GET /api/v1/public/menu` is what the QR code on the table opens and what the
 * restaurant site lists. No login: the restaurant is named by the `X-Tenant`
 * header, and the endpoint only ever returns sellable items of active sections
 * — a draft dish, an archived one, or one the kitchen just put on the
 * stop-list is simply not in the payload, **including under a sub-heading**.
 *
 * That last clause is load-bearing and recently was not true: sub-category
 * items were eager-loaded unfiltered, so every 86'd dish reappeared one level
 * down. It is fixed on the API side, which is where it belongs — this module
 * must never re-derive availability. If a dish is here, it is on sale; if it is
 * not, it is not. A screen that decided for itself would eventually tell a
 * guest they can order something the kitchen has run out of, which is the exact
 * situation the stop-list exists to prevent, aimed at the audience least able
 * to be told otherwise.
 *
 * Server-only: `apiBase()` comes from a module that reads cookies. The types
 * and the fixtures are in `./guest-menu-data.ts`, which client components may
 * import.
 */

/** How long a guest waits before the page draws the fallback instead. */
const TIMEOUT_MS = 4_000;

/** What `PublicMenuController` sends. Narrowed to what a guest screen draws. */
/*
 * The payload's shape and its mapping live in `@restaurant/surfaces` as
 * `GuestMenuPayload` and `guestMenuFrom()`, because the phone reads the same
 * endpoint. What stays here is the fetch — the part that differs between a
 * server component and a device: `apiBase()` from the session module,
 * `cache: 'no-store'`, and the four-second budget before fixtures.
 */

/**
 * Ask the API for a restaurant's public menu.
 *
 * `null` for anything other than a clean answer — an unknown tenant, an API
 * mid-restart, a network that is not there — and every caller treats that the
 * same way: draw the fixtures and mark the screen `live: false`. A QR code that
 * 500s because the API is restarting is a guest holding a phone at a table with
 * nothing on it; a sample menu they cannot order from at least tells them what
 * the restaurant serves, and it says so on screen.
 *
 * `no-store`, deliberately. The payload is per tenant and per language, and
 * both arrive as headers rather than in the path — so a shared response cache
 * keyed by URL would serve one restaurant's menu to the next request that
 * looked alike. The endpoint does its own caching properly, 60 seconds with an
 * ETag behind Redis, which is where a menu should be cached anyway.
 */
export async function fetchGuestMenu(
  tenant: string,
  locale: GuestLocale,
  channel: string = 'dine_in',
): Promise<GuestMenu | null> {
  try {
    const response = await fetch(
      `${apiBase()}/public/menu?channel=${encodeURIComponent(channel)}`,
      {
        headers: {
          Accept: 'application/json',
          'X-Tenant': tenant,
          'X-Locale': locale,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    if (!response.ok) return null;

    return guestMenuFrom((await response.json()) as GuestMenuPayload, tenant, locale);
  } catch {
    return null;
  }
}
