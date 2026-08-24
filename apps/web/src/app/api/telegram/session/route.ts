import { type NextRequest, NextResponse } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { badRequest, jsonBody } from '@/lib/api-proxy';

/**
 * The mini app's sign-in — `POST /api/v1/public/telegram/session`.
 *
 * Its own handler rather than `forward()`: there is no console session here,
 * the credential IS the signed `initData` the browser was handed by Telegram,
 * and the tenant comes from this deployment's default rather than a cookie.
 * The token comes straight back to the page, which keeps it for the life of
 * the mini app — see (telegram)/tg-session.ts for why not a cookie.
 */
type Body = { initData?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const initData = typeof body.initData === 'string' ? body.initData : '';

  if (initData === '' || initData.length > 4096) return badRequest('invalid_init_data');

  const tenant = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? '';

  if (tenant === '') return NextResponse.json({ error: 'no_tenant' }, { status: 500 });

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/telegram/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Tenant': tenant,
      },
      body: JSON.stringify({ init_data: initData }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as {
    token?: string;
    error?: { code?: string };
  } | null;

  if (!upstream.ok) {
    // The two refusals are told apart on purpose: "this restaurant has no
    // bot" is the owner's to fix, "we could not verify you" is the guest's.
    return NextResponse.json(
      { error: payload?.error?.code ?? 'refused' },
      { status: upstream.status },
    );
  }

  return NextResponse.json({ token: payload?.token ?? '' }, { status: 201 });
}
