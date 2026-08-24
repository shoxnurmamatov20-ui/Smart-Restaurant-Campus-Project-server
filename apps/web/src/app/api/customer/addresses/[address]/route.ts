import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * Delete one of the guest's own addresses.
 *
 * The id is not checked here and does not need to be: the API looks it up
 * through the caller's own relation, so an id belonging to somebody else is
 * simply not found. A check in this handler would be a second opinion about
 * ownership that the server has already formed.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!/^\d+$/.test(address)) {
    return Response.json({ error: 'invalid_address' }, { status: 400 });
  }

  return forward(request, `/public/addresses/${address}`, { method: 'DELETE', signedIn: true });
}
