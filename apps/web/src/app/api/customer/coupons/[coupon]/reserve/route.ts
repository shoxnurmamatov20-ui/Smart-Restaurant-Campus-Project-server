import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * Spend points on a coupon.
 *
 * Both writes — the points leaving and the coupon arriving — happen in one
 * transaction on the server. Nothing here retries: a second press is a second
 * key, and the partial unique index behind it answers "you already hold this
 * one" rather than charging twice.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ coupon: string }> },
) {
  const { coupon } = await params;

  if (!/^\d+$/.test(coupon)) {
    return Response.json({ error: 'invalid_coupon' }, { status: 400 });
  }

  return forward(request, `/public/coupons/${coupon}/reserve`, {
    method: 'POST',
    signedIn: true,
  });
}
