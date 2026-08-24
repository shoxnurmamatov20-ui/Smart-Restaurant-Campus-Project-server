import { NextResponse, type NextRequest } from 'next/server';

import { guestTenant } from '@/lib/api-server';
import { apiBase } from '@/lib/server-session';

/**
 * Where is my order — polled from the tracking screen.
 *
 * A read, so none of the write handler's reasons apply and one new one does:
 * the API guards this endpoint with the bill number AND the last four digits of
 * the number that placed it, and the phone belongs on a header rather than in a
 * query string. A phone number in a URL is a phone number in nginx's access log
 * and in every proxy between here and the guest.
 *
 * So the screen sends `X-Guest-Phone`, this forwards it as `X-Guest-Phone`, and
 * the digits never reach anybody's `combined` log format. The query-string form
 * still works upstream — a tracking link in an SMS has nowhere else to carry it
 * — and this handler does not use it.
 *
 * `no-store`, and there is no version of this that could be cached: it is one
 * guest's dinner at one moment, and a shared cache would hand it to whoever
 * asked next.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const tenant = await guestTenant();

  if (tenant === null || number === '') {
    return NextResponse.json({ error: 'unknown_order' }, { status: 404 });
  }

  const phone = request.headers.get('x-guest-phone') ?? '';

  if (phone.trim() === '') {
    // Refused here rather than upstream, so an unanswerable request does not
    // spend one of the guest's ten a minute.
    return NextResponse.json({ error: 'phone_required' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/orders/${encodeURIComponent(number)}`, {
      headers: {
        Accept: 'application/json',
        'X-Tenant': tenant,
        'X-Locale': localeOf(request),
        'X-Guest-Phone': phone,
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    /*
     * One shape for all three refusals, because the API answers one: no such
     * number, not a guest's order, wrong phone. Telling them apart would turn
     * this into a way to count a restaurant's covers.
     */
    return NextResponse.json({ error: 'unknown_order' }, { status: upstream.status });
  }

  return NextResponse.json((await upstream.json().catch(() => null)) ?? {}, { status: 200 });
}

function localeOf(request: NextRequest): 'uz' | 'ru' | 'en' {
  const asked = request.nextUrl.searchParams.get('lang');

  return asked === 'ru' || asked === 'en' ? asked : 'uz';
}
