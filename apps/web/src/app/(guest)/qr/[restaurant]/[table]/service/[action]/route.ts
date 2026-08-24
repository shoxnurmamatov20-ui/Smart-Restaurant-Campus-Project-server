import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

/**
 * The three writes a guest at a table can make, forwarded from Node.
 *
 * Ordering food, calling a waiter and asking for the bill. One handler rather
 * than three files, because every line below is the same for all three — the
 * only thing that differs is the last path segment, and an allowlist is a
 * clearer way to say "these three and nothing else" than three copies of the
 * same forty lines.
 *
 * That the API keeps them apart is a different question and a real one: on the
 * server, "call somebody" and "ask to be charged" have different consequences
 * and live on different routes. Here they are one pipe.
 *
 * ---------------------------------------------------------------------------
 * Why Node and not the browser
 *
 * The same three reasons every write on this platform goes this way. The
 * endpoints sit in the `tenant` middleware group and require an
 * `Idempotency-Key`, which a `fetch` from a screen would have to invent and
 * would then re-invent on every retry. The restaurant arrives as a path segment
 * and has to become `X-Tenant`. And a request from the browser straight to
 * Laravel is treated as stateful by `SANCTUM_STATEFUL_DOMAINS` and refused with
 * a 419 for want of a CSRF token; from Node there is no Origin and no cookie.
 */

/**
 * What a guest may ask for, and where it goes.
 *
 * An allowlist rather than interpolation: `action` comes out of the URL, and
 * `.../service/../../../admin` is what happens when a path segment is trusted.
 */
const ROUTES: Readonly<Record<string, string>> = {
  order: 'order',
  call: 'call',
  pay: 'pay',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ restaurant: string; table: string; action: string }> },
) {
  const { restaurant, table, action } = await params;

  const path = ROUTES[action];

  if (restaurant === '' || table === '' || path === undefined) {
    return NextResponse.json({ error: 'unknown_action' }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    /*
     * An empty body is legitimate for two of the three: "call the waiter" and
     * "we would like to pay" carry nothing but the table, which is in the URL.
     * Only `order` has required fields, and the API is what says so.
     */
    body = {};
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/tables/${encodeURIComponent(table)}/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant': restaurant,
        'X-Locale': localeOf(request),
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as {
    data?: unknown;
    error?: { code?: string; message_uz?: string; message_ru?: string; message_en?: string };
  } | null;

  if (!upstream.ok) {
    /*
     * The API's own sentence, in the reader's language.
     *
     * "Manti hozir mavjud emas", "this table is not in service" and "the basket
     * is empty" are three different things for a guest to do next, and the
     * catalogue already tells them apart in three languages. Flattening them to
     * "something went wrong" would leave somebody pressing the same button.
     */
    const error = payload?.error;
    const locale = localeOf(request);

    return NextResponse.json(
      {
        error: error?.code ?? 'rejected',
        message:
          (locale === 'ru' ? error?.message_ru : locale === 'en' ? error?.message_en : undefined) ??
          error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}

/**
 * Which language to ask the API to answer refusals in.
 *
 * From the query string, because that is where this surface keeps it — the QR
 * pages carry `?lang=` rather than a cookie, since a sticker is printed once and
 * cannot hold a session. Falls back to Uzbek, which is what `guestLocale()`
 * does for the pages themselves.
 */
function localeOf(request: NextRequest): 'uz' | 'ru' | 'en' {
  const asked = request.nextUrl.searchParams.get('lang');

  return asked === 'ru' || asked === 'en' ? asked : 'uz';
}
