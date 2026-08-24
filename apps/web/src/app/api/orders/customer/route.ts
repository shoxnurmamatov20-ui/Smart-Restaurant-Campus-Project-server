import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, forward } from '@/lib/api-proxy';

/**
 * Who is on the telephone.
 *
 * The intake screen's first step: an operator types a number while the caller
 * is still saying hello, and what comes back decides the rest of the call —
 * a regular gets their address and their usual read back to them, a stranger
 * gets asked for one.
 *
 * `GET /api/v1/crm/customers?filter[phone]=` answers it. Exact rather than
 * partial, which is what the filter is: a phone number is an identity, and a
 * partial match would offer the operator somebody else's account because two
 * numbers share six digits.
 *
 * Two calls, not one. The customer row answers who and how often and what they
 * usually order; the address list answers where to send it, and is asked for
 * separately so the guest list — the same endpoint, a hundred rows at a time —
 * does not pay for a lookup only this screen makes.
 *
 * Under `api/orders/` rather than `api/crm/` because this is the order intake
 * desk's lookup and it travels with the screen that makes the call. The till
 * has its own copy of this question at `api/pos/customer` and it is genuinely a
 * different one: that handler carries a shift token issued at a terminal, this
 * one carries the operator's console session, and the two must not share a
 * route that reads whichever cookie it finds.
 */
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');

  // `+998` and nine digits. Anything else is not a number this market has, and
  // asking anyway spends a round trip to be told so.
  if (phone === null || !/^\+998\d{9}$/.test(phone)) return badRequest('invalid_phone');

  const answer = await forward(
    request,
    `/crm/customers?filter[phone]=${encodeURIComponent(phone)}&per_page=1`,
    { method: 'GET' },
  );

  if (!answer.ok) return answer;

  const body = (await answer.json().catch(() => null)) as {
    data?: {
      id: number;
      name?: string | null;
      visits_count?: number;
      total_spent?: number;
      note?: string | null;
      last_visit_at?: string | null;
      usual_order?: string | null;
    }[];
  } | null;

  const found = body?.data?.[0] ?? null;

  /*
   * Where to send the food, as a second call and only for a guest we found.
   *
   * A separate read rather than an include, because `GET /crm/customers` is
   * also the guest list — a hundred rows at a time — and folding four addresses
   * into each of them would make the busy read pay for this one. A stranger
   * costs nothing extra: there is nobody to look addresses up for.
   *
   * A failure here is silence rather than an error. The operator has a name, a
   * history and a usual order in front of them and the caller is still talking;
   * losing the whole card because the address list did not come back would be
   * the wrong trade.
   */
  let address: string | null = null;

  if (found !== null) {
    const addresses = await forward(request, `/crm/customers/${found.id}/addresses`, {
      method: 'GET',
    });

    if (addresses.ok) {
      const list = (await addresses.json().catch(() => null)) as {
        data?: { full_line?: string | null }[];
      } | null;

      // The default is first — the endpoint orders it that way — and it is the
      // line an operator reads back down the telephone.
      address = list?.data?.[0]?.full_line ?? null;
    }
  }

  /*
   * Narrowed here rather than passed through whole.
   *
   * A customer row carries a birthday, allergens and a loyalty balance, and the
   * card on this screen shows four things. Sending the rest into a browser is
   * sending personal data to a page that has no use for it — and the day the
   * resource grows a field, it would arrive here without anybody deciding it
   * should.
   */
  return NextResponse.json({
    data:
      found === null
        ? null
        : {
            id: found.id,
            name: found.name ?? null,
            visits: found.visits_count ?? 0,
            spend: found.total_spent ?? 0,
            note: found.note ?? null,
            lastVisitAt: found.last_visit_at ?? null,
            usualOrder: found.usual_order ?? null,
            address,
          },
  });
}
