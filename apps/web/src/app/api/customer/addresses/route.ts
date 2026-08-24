import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/** Where a courier is told to go. Read and add; one address is deleted next door. */
export async function GET(request: NextRequest) {
  return forward(request, '/public/addresses', { method: 'GET', signedIn: true });
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  return forward(request, '/public/addresses', { method: 'POST', body, signedIn: true });
}
