import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * A dish photograph on its way to the API.
 *
 * `?id=412` becomes `POST /api/v1/menu/items/412/image`, multipart, one file.
 * Proxied for the reason everything in this app is proxied: the session token
 * is an httpOnly cookie the browser cannot read, so the drawer cannot post to
 * Laravel itself — and the manager's own token goes up, so the API decides on
 * `menu.update` against the person who actually pressed the button.
 *
 * The body is streamed through untouched. Re-encoding it here would mean
 * holding a two-megabyte buffer in the Node process for no gain: the API is
 * what validates the type and the size, and it is what resizes.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');

  if (id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid_item' }, { status: 400 });
  }

  const form = await request.formData();
  const image = form.get('image');

  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }

  const upstream_body = new FormData();
  upstream_body.append('image', image, image.name);

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/menu/items/${id}/image`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        /*
         * A key per press. The upload is the one write in this console that a
         * manager does on a phone, where a lost response and a browser retry
         * are the normal case rather than the exception — and two of the same
         * photograph is one wasted upload rather than two objects, because the
         * store writes to a path derived from the dish.
         */
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: upstream_body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    // 422 is the usual one and it is a real answer: too large, or not an image.
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  return NextResponse.json(await upstream.json());
}

/**
 * The photograph, taken off — `DELETE /api/menu/image?id=412`.
 *
 * The same proxy in the other direction, for the same reason: the token is
 * httpOnly and the API decides on `menu.update` against the person who
 * pressed the button. A lost response and a retry land on a 404 from the API,
 * which is the right answer: the first attempt did the work.
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');

  if (id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid_item' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/menu/items/${id}/image`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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

  return NextResponse.json(await upstream.json());
}
