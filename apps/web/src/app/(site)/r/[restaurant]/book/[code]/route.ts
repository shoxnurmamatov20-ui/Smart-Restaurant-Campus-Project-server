import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

/**
 * A guest's own booking, by the code they were given.
 *
 * Three upstream routes behind two methods — `GET reservations/{code}`,
 * `POST .../confirm` and `POST .../cancel` — and the third is the one that pays
 * for the other two. A guest who cannot call a booking off from their phone
 * telephones a room that is busy serving dinner, which in practice means nobody
 * telephones: the table stays held for a party that is not coming and the
 * evening is short a cover somebody else wanted.
 *
 * The code is the whole credential and it is enough — ten characters from an
 * alphabet with the confusable pairs removed, so unlike a bill number there is
 * no neighbouring code to guess. `PublicReservationCodeController` spends a
 * paragraph on why that is a decision rather than an oversight.
 *
 * Through Node for the three reasons `./../submit/route.ts` sets out: the
 * restaurant is the slug in this URL and has to become `X-Tenant`; the two
 * writes sit in the `tenant` middleware group and are refused without an
 * `Idempotency-Key`; and a browser calling Laravel directly is treated as
 * stateful by `SANCTUM_STATEFUL_DOMAINS` and refused with a 419.
 *
 * The action is a key into a fixed table, never a path fragment off the
 * request. Interpolating a caller's word into an upstream path is how a public
 * handler points at an endpoint nobody meant to publish.
 */
const ACTIONS = {
  confirm: 'confirm',
  cancel: 'cancel',
} as const;

/** The alphabet `Reservation::newCode()` draws from, ten characters of it. */
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurant: string; code: string }> },
) {
  const { restaurant, code } = await params;
  const asked = normalise(restaurant, code);

  if (asked === null) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  return relay(request, `/public/reservations/${asked}`, restaurant, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ restaurant: string; code: string }> },
) {
  const { restaurant, code } = await params;
  const asked = normalise(restaurant, code);

  if (asked === null) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = ACTIONS[String(body?.action) as keyof typeof ACTIONS];

  if (action === undefined) return NextResponse.json({ error: 'unknown_action' }, { status: 400 });

  return relay(request, `/public/reservations/${asked}/${action}`, restaurant, 'POST');
}

/**
 * The code as the API stores it, or null.
 *
 * Upper-cased before it is checked, because the code is printed in capitals and
 * typed by a guest whose keyboard is not — `Reservation::findByCode()` does the
 * same, and a shape check that failed on case would refuse a booking the person
 * is holding in their hand.
 */
function normalise(restaurant: string, code: string): string | null {
  const asked = decodeURIComponent(code).trim().toUpperCase();

  return restaurant !== '' && CODE.test(asked) ? asked : null;
}

async function relay(
  request: NextRequest,
  path: string,
  restaurant: string,
  method: 'GET' | 'POST',
): Promise<NextResponse> {
  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'X-Tenant': restaurant,
        // Only the writes need one, and minting it for the read costs nothing
        // next to a branch that has to be read twice to be believed.
        'Idempotency-Key': crypto.randomUUID(),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
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
     * "No booking with that code" and "that booking is already closed" are two
     * different things for a guest to do next — retype, or ring the restaurant
     * — and the catalogue already tells them apart in three languages.
     */
    const locale = localeOf(request);
    const error = payload?.error;

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

function localeOf(request: NextRequest): 'uz' | 'ru' | 'en' {
  const asked = request.nextUrl.searchParams.get('lang');

  return asked === 'ru' || asked === 'en' ? asked : 'uz';
}
