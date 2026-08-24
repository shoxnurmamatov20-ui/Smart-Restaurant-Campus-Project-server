import { type NextRequest, NextResponse } from 'next/server';

import { apiBase } from '@/lib/server-session';

/**
 * A read on a Telegram guest's behalf.
 *
 * The mini app holds a customer token in its own session storage and cannot
 * call Laravel directly (the API is not exposed on this origin), so this
 * carries the token through — and nothing else: the path is checked against
 * a small allow-list, because a proxy that forwards any path with any token
 * is an open door dressed as a convenience.
 */
const ALLOWED = /^\/public\/(me|orders|orders\/[A-Za-z0-9-]{1,32})(\?[A-Za-z0-9_=&\[\]-]{0,80})?$/;

export async function GET(request: NextRequest) {
  const token = request.headers.get('X-Tg-Token') ?? '';
  const path = request.nextUrl.searchParams.get('path') ?? '';

  if (token === '') return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!ALLOWED.test(path)) return NextResponse.json({ error: 'path_not_allowed' }, { status: 400 });

  const tenant = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? '';

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(tenant === '' ? {} : { 'X-Tenant': tenant }),
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const body = (await upstream.json().catch(() => null)) as unknown;

  return NextResponse.json(body ?? {}, { status: upstream.status });
}
