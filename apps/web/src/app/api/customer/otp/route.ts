import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * "Kod yuborish" — ask the platform to text a sign-in code.
 *
 * A thin forward, and it stays thin deliberately: every limit that matters is
 * on the server, where it can be counted per NUMBER rather than per browser.
 * One send a minute and five an hour per number, ten a minute per address —
 * see `App\Support\Auth\OtpCredentials`. A limit implemented here would be a
 * limit a second tab does not know about.
 *
 * The code is never in the answer. Locally it is in `storage/logs`; that is
 * what `LogSmsSender` is for, and it is why this handler has nothing to read.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  return forward(request, '/public/auth/otp', { method: 'POST', body });
}
