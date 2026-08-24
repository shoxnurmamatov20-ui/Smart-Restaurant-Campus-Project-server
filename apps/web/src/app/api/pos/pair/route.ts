import { NextResponse, type NextRequest } from 'next/server';

import { APP_VERSION } from '@/lib/constants';
import { apiBase } from '@/lib/server-session';
import { POS_TENANT_COOKIE, POS_TOKEN_COOKIE, posCookieOptions } from '@/lib/pos-session';

/**
 * Turning a tablet into a till, from this app's own origin.
 *
 * The same shape as the console's sign-in handler and for the same two
 * reasons: a device token belongs in an httpOnly cookie no script in the room
 * can read, and a server component cannot see a token the browser is holding.
 * See lib/pos-session.ts for why a till's token is not a person's session.
 *
 * The pairing code never touches this app's storage. It arrives, it is
 * forwarded once, and it is gone — on the API side too, which destroys it on
 * redemption.
 */

/** What Laravel answers `POST /api/v1/pos/terminals/pair` with. */
type PairResponse = {
  token: string;
  terminal: {
    code: string;
    name: string;
    mode: string;
    branch?: { name: string } | null;
  };
  tenant: { slug: string | null };
};

/** The catalogue's shape for a refusal, narrowed to what this handler shows. */
type ApiErrorBody = {
  error?: {
    code?: string;
    message_uz?: string;
    message_ru?: string;
    message_en?: string;
    errors?: Record<string, string[]>;
  };
};

export async function POST(request: NextRequest) {
  let body: { code?: unknown; fingerprint?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Upper-cased and trimmed here as well as on the API: the pairing alphabet
  // has no lower case, and a tablet keyboard capitalises unpredictably.
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';

  if (code === '') {
    return NextResponse.json({ error: 'missing_code' }, { status: 422 });
  }

  /*
   * A stable identifier for this device.
   *
   * The API records it so a manager can tell one tablet from another, and so
   * re-pairing a replaced device is visible rather than silent. There is
   * nothing secret in it and it is not a credential — the token is.
   */
  const fingerprint =
    typeof body.fingerprint === 'string' && body.fingerprint.length > 0
      ? body.fingerprint.slice(0, 128)
      : 'web-terminal';

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/pos/terminals/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        code,
        device_fingerprint: fingerprint,
        app_version: APP_VERSION,
      }),
      cache: 'no-store',
    });
  } catch {
    // Unreachable is not the same as refused, and the two need different words
    // in front of whoever is holding the tablet: "try again" against "ask for
    // a new code".
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as ApiErrorBody | null;

    // The API's own sentence, in the reader's language, rather than one
    // invented here — it already distinguishes "wrong or used" from "expired"
    // from "that till is switched off", and a second copy would drift.
    return NextResponse.json(
      {
        error: 'rejected',
        code: detail?.error?.code,
        message: detail?.error?.errors?.code?.[0] ?? detail?.error?.message_uz,
      },
      { status: upstream.status === 422 ? 422 : 401 },
    );
  }

  const data = (await upstream.json()) as PairResponse;

  if (typeof data.tenant?.slug !== 'string' || data.tenant.slug === '') {
    // A token with no restaurant to send alongside it would authenticate and
    // then read nothing: the API cannot infer a restaurant from a device the
    // way it can from a person. Refusing here beats a till that pairs and then
    // shows an empty screen forever.
    return NextResponse.json({ error: 'no_tenant' }, { status: 502 });
  }

  const response = NextResponse.json({
    terminal: {
      code: data.terminal.code,
      name: data.terminal.name,
      branch: data.terminal.branch?.name ?? null,
    },
  });

  response.cookies.set(POS_TOKEN_COOKIE, data.token, { ...posCookieOptions, httpOnly: true });
  response.cookies.set(POS_TENANT_COOKIE, data.tenant.slug, {
    ...posCookieOptions,
    // Not httpOnly and nothing rides on it: it is a restaurant's public slug,
    // and the API decides what the token may touch regardless of what is sent
    // beside it.
    httpOnly: false,
  });

  return response;
}

/**
 * Unpair this tablet.
 *
 * Local only, on purpose. Revoking the token belongs to the manager in the
 * back office — a device that could revoke itself could be un-paired by
 * anybody who picked it up, and the till would need a code read across the
 * room to come back. This just forgets what this browser is holding.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(POS_TOKEN_COOKIE, '', { ...posCookieOptions, httpOnly: true, maxAge: 0 });
  response.cookies.set(POS_TENANT_COOKIE, '', { ...posCookieOptions, httpOnly: false, maxAge: 0 });

  return response;
}
