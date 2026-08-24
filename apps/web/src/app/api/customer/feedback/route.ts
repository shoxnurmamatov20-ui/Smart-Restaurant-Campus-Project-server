import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * "Muammo bor edi" — a guest saying what went wrong.
 *
 * `signedIn: 'optional'` is the whole design. A guest at a table has no account
 * and their complaint still counts; a signed-in guest's review should land on
 * their record rather than beside it. One endpoint, because two would mean the
 * anonymous one collects nothing.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  /*
   * `?restaurant=` when the caller knows it. The QR rating screen does — the
   * slug is in the sticker's own URL — and one host serves every restaurant's
   * stickers, so resolving from the host would file the review against the
   * deployment's default tenant.
   */
  const named = request.nextUrl.searchParams.get('restaurant');

  return forward(request, '/public/feedback', {
    method: 'POST',
    body,
    signedIn: 'optional',
    tenant: named ?? undefined,
  });
}
