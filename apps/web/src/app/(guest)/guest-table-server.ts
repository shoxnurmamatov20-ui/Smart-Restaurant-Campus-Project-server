import { apiBase } from '@/lib/server-session';

import { tableOrderFrom, type TableOrderEnvelope } from '@restaurant/surfaces/guest/live';
import type { GuestLocale } from '@restaurant/surfaces/guest/menu-data';
import type { TableOrder } from '@restaurant/surfaces/guest/table-data';

export { stepOf, tableOrderFrom } from '@restaurant/surfaces/guest/live';
export type { TableOrderPayload } from '@restaurant/surfaces/guest/live';

/**
 * What the table in front of this guest has ordered — read from the API.
 *
 * The twin of `guest-menu-server.ts`, and split the same way: the fetch is
 * here, because it needs `apiBase()` and therefore `next/headers`, and the
 * mapping is in `@restaurant/surfaces/guest/live` because the phone renders the
 * same table and there must not be two opinions about what `cooking` means.
 *
 * ---------------------------------------------------------------------------
 * Three answers, not two
 *
 * `null` means the request did not come back clean — an unknown table, an API
 * mid-restart, a network that is not there — and the screen falls back to the
 * fixture and says `Namoyish rejimi` on it, exactly as the menu does.
 *
 * `{ order: null }` means the request DID come back clean and this table has
 * nothing open. That is not a failure and must not draw a demo bill: a guest
 * who has just sat down would be shown four courses somebody else ate.
 *
 * The two are told apart here rather than by the caller, because only the fetch
 * knows which happened.
 */
export type TableOrderState =
  /** Live, and the table may have nothing open yet. */
  | { live: true; order: TableOrder | null }
  /** The API did not answer. Draw the fixture and say so. */
  | { live: false; order: null };

/** How long a guest waits before the page draws the fallback instead. */
const TIMEOUT_MS = 4_000;

/**
 * The ETA the guest screens print.
 *
 * `GET /public/tables/{token}/order` answers a bill, not a promise: a dine-in
 * table is not quoted a delivery time and `orders.promised_at` is null on one.
 * So the number comes from here rather than from the payload, and it is a
 * house average rather than a computation — the honest answer to "when will it
 * come" at a table is "about twenty minutes", and a screen that said 18 would
 * be claiming a precision the kitchen never gave it.
 */
const DINE_IN_ETA_MINUTES = 20;

/**
 * Ask the API what is on this table's bill.
 *
 * `token` is the table's `qr_token` — the 22 characters printed on the sticker
 * — never its id. See `PublicTableController` for why an id in this position
 * would be an endpoint where typing the next number reads the next table.
 *
 * `no-store`, deliberately, and for a stronger reason than the menu's: this is
 * one table's bill at one moment. A cached copy served to the next request is
 * somebody else's dinner.
 */
export async function fetchTableOrder(
  tenant: string,
  token: string,
  locale: GuestLocale,
  now: Date = new Date(),
): Promise<TableOrderState> {
  try {
    const response = await fetch(`${apiBase()}/public/tables/${encodeURIComponent(token)}/order`, {
      headers: {
        Accept: 'application/json',
        'X-Tenant': tenant,
        'X-Locale': locale,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return { live: false, order: null };

    const body = (await response.json()) as TableOrderEnvelope;

    return {
      live: true,
      order: tableOrderFrom(body.data, locale, DINE_IN_ETA_MINUTES, now),
    };
  } catch {
    return { live: false, order: null };
  }
}
