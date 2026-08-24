import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * A test docket, on its way to one printer.
 *
 * `{ id: 3 }` becomes `POST /api/v1/kitchen/printers/3/test`. Proxied for the
 * reason everything in this app is proxied: the session token is an httpOnly
 * cookie the browser cannot read, so the settings panel cannot ask Laravel
 * itself — and the reader's own token goes up, so the API decides on
 * `kitchen.manage` against the person actually clicking.
 *
 * The id is checked against a digit pattern rather than passed through. It
 * comes from a rendered row today, but a handler that interpolates whatever it
 * is given can be aimed at any endpoint the reader's token happens to reach.
 *
 * What lands is a queued job, not paper. The print agent — the process that
 * claims jobs and pushes bytes at a socket — is the part still missing, so the
 * row sits `pending` until one exists. That is the honest outcome and the
 * response says so rather than reporting a success nobody can see.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = String(body?.id ?? '');

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid_printer' }, { status: 400 });
  }

  let upstream: Response;

  try {
    // `/kitchen/...`, not `/v1/kitchen/...`. `apiBase()` already ends
    // `.../api/v1`, so the version prefix here asked for `/api/v1/v1/...`, got
    // a 404, and this handler answered `not_sent` — which reads on screen as a
    // printer that is offline. The test button has never once reached a printer.
    upstream = await fetch(`${apiBase()}/kitchen/printers/${id}/test`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        // Every mutating endpoint on this API requires one. Minted per click:
        // a second tap is a second test docket, which is what a person tapping
        // twice actually wants.
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: '{}',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  return NextResponse.json(await upstream.json());
}
