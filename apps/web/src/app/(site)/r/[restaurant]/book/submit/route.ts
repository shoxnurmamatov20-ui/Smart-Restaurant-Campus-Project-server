import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

/**
 * The booking form's one call, made from Node rather than the browser.
 *
 * Three reasons, and the first is the one that would otherwise be found at
 * runtime: `POST /api/v1/public/reservations` sits in the `tenant` middleware
 * group, so it requires an `Idempotency-Key` — a header a plain form post does
 * not carry, and a fourth guard against the double-tap the endpoint already
 * defends against twice.
 *
 * The second is the restaurant. A device with no session cannot tell the API
 * which venue it is booking, so the slug from the URL becomes `X-Tenant` here —
 * the same arrangement the QR menu uses.
 *
 * The third is the one every session handler in this repository documents: a
 * request from the browser straight to Laravel is treated as stateful by
 * `SANCTUM_STATEFUL_DOMAINS` and refused with a 419 for want of a CSRF token.
 * From Node there is no Origin and no cookie.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;

  if (restaurant === '') {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/reservations`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant': restaurant,
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
    error?: {
      code?: string;
      detail?: string;
      message_uz?: string;
      message_ru?: string;
      message_en?: string;
      errors?: Record<string, string[]>;
    };
  } | null;

  if (!upstream.ok) {
    /*
     * The API's own sentence, in the reader's language where it has one.
     *
     * "That time is taken", "call us for a party that size" and "the date is in
     * the past" are three different things for a guest to do next, and the
     * validator already tells them apart. Flattening to "booking failed" would
     * leave somebody retyping the same date.
     */
    const error = payload?.error;
    const locale = localeOf(request);
    const firstField = Object.values(error?.errors ?? {})[0]?.[0];

    return NextResponse.json(
      {
        /*
         * The code as well as the sentence, because `tables.slot_unavailable`
         * is the one refusal the form can act on by itself: the chooser
         * redraws from `GET /public/booking-slots` and offers what is left.
         * Everything else it can only repeat.
         */
        error: error?.code ?? 'rejected',
        message:
          firstField ??
          error?.detail ??
          (locale === 'ru' ? error?.message_ru : locale === 'en' ? error?.message_en : undefined) ??
          error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}

function localeOf(request: NextRequest): 'uz' | 'ru' | 'en' {
  const asked = request.nextUrl.searchParams.get('lang');

  return asked === 'ru' || asked === 'en' ? asked : 'uz';
}
