import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/** The loyalty shelf, plus this guest's balance and what they already hold. */
export async function GET(request: NextRequest) {
  return forward(request, '/public/coupons', { method: 'GET', signedIn: true });
}
