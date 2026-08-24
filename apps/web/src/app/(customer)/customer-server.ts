import { cache } from 'react';

import { apiBase } from '@/lib/server-session';

import {
  customerMenuFrom,
  customerVenuesFrom,
  DEMO_MENU,
  DEMO_VENUES,
  type CustomerMenu,
  type CustomerVenues,
  type GuestBranchEnvelope,
  type Lang,
} from '@restaurant/surfaces/customer/live';
import type { GuestMenuPayload } from '@restaurant/surfaces/guest/menu-data';

/**
 * The customer app's catalogue, from the API.
 *
 * `GET /api/v1/public/menu` — the one endpoint the platform publishes to the
 * public, and the same one the QR menu and the restaurant site read. No login:
 * a customer browsing before they sign in is a stranger, and the restaurant is
 * named by the `X-Tenant` header rather than by a session.
 *
 * This file used to not exist, and the menu screen said so in its own comment:
 * *"Fixtures still. There is no customer-facing catalogue endpoint."* There was
 * one; nothing had been wired to it. So the app quoted prices from a fixture —
 * four dishes a restaurant had never priced, and a "Bugun tugadi" chip that
 * could never light because nothing told it the kitchen had run out.
 *
 * ---------------------------------------------------------------------------
 * Which restaurant
 *
 * The QR surface takes it from the sticker's own URL. This app has no such
 * segment — a customer opens `/customer`, not `/r/{slug}/customer` — so the
 * build names one, `NEXT_PUBLIC_DEFAULT_TENANT`, exactly as `api-server.ts`
 * already does for the console. A deployment serving several restaurants from
 * one consumer app needs a real chooser, and that is a product decision rather
 * than a fetch.
 *
 * Server-only: `apiBase()` comes from a module that reads cookies. The mapping
 * and the fixtures are in `@restaurant/surfaces/customer/live`, which client
 * components and the phone both import.
 */

/** How long a customer waits before the screen draws the fallback instead. */
const TIMEOUT_MS = 4_000;

function tenant(): string | null {
  return process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? null;
}

/**
 * Ask the API for the catalogue, or answer with the fixtures and say so.
 *
 * Never throws and never returns null: a customer opening the app while the API
 * restarts gets a menu they can read, marked `live: false`, and the screens are
 * built to show that. The alternative — an empty screen — tells them the
 * restaurant has no food.
 *
 * `no-store`, deliberately. The payload is per tenant and per language and both
 * arrive as headers rather than in the path, so a response cache keyed by URL
 * would serve one restaurant's menu to the next request that looked alike. The
 * endpoint caches properly on its own side, 60 seconds behind an ETag.
 */
export const fetchCustomerMenu = cache(async (lang: Lang): Promise<CustomerMenu> => {
  const body = await ask<GuestMenuPayload>('/public/menu?channel=delivery', lang);

  return body === null ? DEMO_MENU : (customerMenuFrom(body) ?? DEMO_MENU);
});

/**
 * The venues a guest may order from — `GET /api/v1/public/branches`.
 *
 * The delivery fee is why this call exists. `BRANCHES` in the surfaces package
 * prices carriage at a flat 12 000 so'm because a design mock has to draw a
 * number; the server derives it per venue from
 * `branches.settings['delivery.fee_tiyin']` and recomputes it on the order. A
 * cart quoting the fixture and a bill charging the setting is the drift
 * `pricing.ts` warns about, arriving at the exact moment a guest is asked to pay.
 */
export const fetchCustomerVenues = cache(async (lang: Lang): Promise<CustomerVenues> => {
  const body = await ask<GuestBranchEnvelope>('/public/branches', lang);

  return body === null ? DEMO_VENUES : (customerVenuesFrom(body) ?? DEMO_VENUES);
});

/**
 * One anonymous, tenant-scoped GET, or null.
 *
 * `cache()` around each caller rather than around this: the two endpoints have
 * different fallbacks and a shared helper that knew about both would have to
 * carry a union nobody wants. What `cache()` buys is that the layout and the
 * screen inside it ask once between them — otherwise every customer page would
 * fetch the menu twice per render.
 */
async function ask<T>(path: string, lang: Lang): Promise<T | null> {
  const slug = tenant();

  if (slug === null) return null;

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: {
        Accept: 'application/json',
        'X-Tenant': slug,
        'X-Locale': lang,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
