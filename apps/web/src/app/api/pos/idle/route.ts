import { NextResponse } from 'next/server';

import { fetchIdleScreen } from '@/lib/pos-session';

/**
 * The idle screen's minute poll.
 *
 * The browser cannot call Laravel for this: the device token lives in an
 * httpOnly cookie precisely so nothing on the page can read it, which also
 * means nothing on the page can send it. So the poll comes here, and Node
 * attaches the credential.
 *
 * 503 rather than 200-with-nulls when the API cannot be reached. The screen
 * treats the two differently — it keeps the last figures and turns the link
 * light red — and a 200 carrying nothing would be indistinguishable from a
 * restaurant that had genuinely gone quiet.
 */
export async function GET() {
  const idle = await fetchIdleScreen();

  if (idle === null) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  return NextResponse.json(idle);
}
