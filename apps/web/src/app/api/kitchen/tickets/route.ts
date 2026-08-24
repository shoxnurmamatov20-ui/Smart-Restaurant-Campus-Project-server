import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * The five buttons on the kitchen display.
 *
 * `?id=412&move=ready` becomes `POST /api/v1/kitchen/tickets/412/ready`. One
 * handler rather than four route files, because the moves differ by a single
 * word and share everything else — the credential, the key, the refusal.
 *
 * Proxied for the reason everything in this app is proxied: the session token is
 * in an httpOnly cookie, and a board running in the browser cannot read it. The
 * cook's own token goes up, so the API decides on `kitchen.update` against the
 * person actually standing at the pass.
 *
 * The allowed moves are listed here rather than passed through. `move` arrives
 * in a URL, and a URL is something anybody can type; interpolating it into an
 * upstream path unchecked would let this handler be pointed at any POST endpoint
 * the cook's token happens to reach.
 */
const MOVES = ['accept', 'start', 'ready', 'serve', 'recall'] as const;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  const move = request.nextUrl.searchParams.get('move');

  if (id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid_ticket' }, { status: 400 });
  }

  if (move === null || !(MOVES as readonly string[]).includes(move)) {
    return NextResponse.json({ error: 'invalid_move' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/kitchen/tickets/${id}/${move}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        /*
         * A key per press.
         *
         * The board is touched with the back of a hand and it is the one screen
         * in the building nobody has clean fingers for. A double-tap on "ready"
         * is the same move twice and the second is already a no-op upstream —
         * what this stops is one press being counted twice because the response
         * was lost on the way back and the browser retried it.
         */
        'Idempotency-Key': crypto.randomUUID(),
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    /*
     * A 422 here is a real answer, not a fault: the ticket has already moved,
     * usually because the cook at the next station got to it first. The board
     * leaves its card alone and the broadcast that follows corrects it, which is
     * the right outcome — two cooks racing for one docket should not produce an
     * error message either of them has to read.
     */
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  return NextResponse.json(await upstream.json());
}
