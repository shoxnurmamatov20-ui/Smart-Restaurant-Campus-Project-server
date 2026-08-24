import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

import {
  CREW_DEVICE_COOKIE,
  CREW_TENANT_COOKIE,
  crewDeviceCookieOptions,
} from '../../crew-session';

/**
 * Enrolling a phone: eight characters in, a device token kept out of reach.
 *
 * The only unauthenticated call this surface makes. A handset that has never
 * been enrolled holds nothing at all — no token, no restaurant — so there is
 * nothing to authenticate with, and the code is what identifies both. It lives
 * ten minutes and the upstream route is throttled to ten attempts a minute.
 *
 * Both cookies are written together and neither is readable from script. The
 * tenant slug is not a secret, but splitting it out to a script-readable cookie
 * would buy nothing and leave two cookies with two lifetimes to drift apart —
 * and a token with no restaurant beside it is a guaranteed refusal upstream.
 */
export async function POST(request: NextRequest) {
  let body: { code?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';

  /*
   * Eight characters from an alphabet with no I, O, 0 or 1 — the code is read
   * aloud across a room, so the letters that get misheard are simply absent.
   * Checked here so a typo costs nothing from the ten attempts a minute.
   */
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{8}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_code_format' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/staff/devices/pair`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code,
        /*
         * Something stable per handset, and not a security control.
         *
         * It is what makes a manager's device list readable a month later —
         * "iPhone, last seen Tuesday" — and what makes a duplicate enrolment
         * visible. Anything a client can generate a client can lie about; the
         * credential is the code.
         */
        device_fingerprint: request.headers.get('user-agent')?.slice(0, 128) ?? 'unknown',
        app_version: '1.0.0',
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as {
    token?: string;
    data?: { label?: string; branch_code?: string | null };
    tenant?: { slug?: string | null };
    error?: { code?: string };
  } | null;

  if (!upstream.ok || typeof payload?.token !== 'string' || !payload.tenant?.slug) {
    return NextResponse.json(
      { error: 'rejected', code: payload?.error?.code },
      { status: upstream.status === 200 ? 422 : upstream.status },
    );
  }

  const answer = NextResponse.json({
    label: payload.data?.label ?? null,
    branch_code: payload.data?.branch_code ?? null,
  });

  answer.cookies.set(CREW_DEVICE_COOKIE, payload.token, crewDeviceCookieOptions);
  answer.cookies.set(CREW_TENANT_COOKIE, payload.tenant.slug, crewDeviceCookieOptions);

  return answer;
}
