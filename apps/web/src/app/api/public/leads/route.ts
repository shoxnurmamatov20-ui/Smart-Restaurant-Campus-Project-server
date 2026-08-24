import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * The contact form on the marketing site.
 *
 * CLAUDE.md makes this the top of the only sales funnel there is — "restoran
 * `#contact` orqali keladi, tenant'ni operator ochadi" — and until now the form
 * flashed a thank-you and forgot everything typed into it.
 *
 * No token: nobody filling this in has an account yet, by definition. It goes
 * through Node for the other three reasons every public write does — the
 * idempotency key, the tenant that is not in the URL, and the 419 a
 * browser→Laravel call earns.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  return forward(request, '/public/leads', { method: 'POST', body });
}
