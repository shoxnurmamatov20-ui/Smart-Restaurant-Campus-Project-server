import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * 86, and un-86.
 *
 * POST takes a dish off in this kitchen, DELETE puts it back. Both answer with
 * the whole sheet, so the screen never has to reconcile a partial update against
 * what it already had — it draws what came back.
 *
 * Proxied for the usual reason: the chef's session token is in an httpOnly cookie
 * the wall screen's JavaScript cannot read. Their own token goes up, so the API
 * decides on `kitchen.update` against the person who actually tapped it, and the
 * audit row names them.
 */
type Sheet = { changed?: boolean; data?: unknown };

async function forward(request: NextRequest, path: string, init: RequestInit) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        // A key per tap. Two cooks reaching the same tile within a second is the
        // normal case, and the API answers `changed: false` for the second — this
        // is for the other failure: one tap counted twice because the response was
        // lost on the way back.
        'Idempotency-Key': crypto.randomUUID(),
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  return NextResponse.json((await upstream.json()) as Sheet);
}

export async function POST(request: NextRequest) {
  let body: { menu_item_id?: unknown; reason?: unknown; until?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  /*
   * Checked here as well as upstream, because the fixture sheet carries negative
   * ids for dishes that do not exist. Without this a tap on the demo board would
   * reach the API and come back as a validation error the screen would show as a
   * real failure.
   */
  if (
    typeof body.menu_item_id !== 'number' ||
    !Number.isInteger(body.menu_item_id) ||
    body.menu_item_id < 1
  ) {
    return NextResponse.json({ error: 'invalid_dish' }, { status: 400 });
  }

  return forward(request, '/kitchen/stop-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_item_id: body.menu_item_id,
      reason: typeof body.reason === 'string' ? body.reason : null,
      until: typeof body.until === 'string' ? body.until : null,
    }),
  });
}

export async function DELETE(request: NextRequest) {
  const dish = request.nextUrl.searchParams.get('dish');

  if (dish === null || !/^\d+$/.test(dish)) {
    return NextResponse.json({ error: 'invalid_dish' }, { status: 400 });
  }

  return forward(request, `/kitchen/stop-list/${dish}`, { method: 'DELETE' });
}
