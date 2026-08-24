import { NextResponse } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { TENANT_HEADER } from '@/lib/constants';

/**
 * The forgot-password form, forwarded from Node.
 *
 * Same reason as `auth/session`: a request from the browser to Laravel is a
 * stateful Sanctum request and fails CSRF (419); from Node it is a plain
 * token-less call. The API answers 204 whether or not the address exists, and
 * so does this — the form is never an account oracle.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';

  if (email === '' || email.length > 190) {
    return NextResponse.json({ error: { code: 'auth.email_invalid' } }, { status: 422 });
  }

  const tenant = process.env.NEXT_PUBLIC_DEFAULT_TENANT;

  try {
    await fetch(`${apiBase()}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // A mail that did not go is a mail the person will ask for again; telling
    // them the server hiccuped would leak nothing and help nothing.
  }

  return new NextResponse(null, { status: 204 });
}
