import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, jsonBody } from '@/lib/api-proxy';
import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';
import { apiBase } from '@/lib/server-session';
import { mpForward } from '@/lib/mp-proxy';

/**
 * Adding one delivery address, without losing the others.
 *
 * `PUT /api/v1/mp/me/addresses` replaces the whole book — the API says why, and
 * it is the right shape for a table that never holds more than a handful of
 * rows. What it means here is that "add one" is a read-modify-write, and the
 * read has to happen on this side.
 *
 * It cannot happen in the browser: the sheet draws `SAVED_ADDRESSES`, a fixture,
 * so a client that sent "what it is showing plus the new one" would replace a
 * real address book with the design's two sample addresses the first time
 * somebody added a third. That is the whole reason this handler exists rather
 * than a thin proxy — the list that goes up is the one the API itself last
 * answered with, never the one on screen.
 */
type Body = { label?: unknown; address?: unknown; note?: unknown };

/** `SaveAddressBookRequest` — six rows, and the API refuses a seventh. */
const MAX_ADDRESSES = 6;

type ApiAddress = {
  label: string;
  address: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
};

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(MP_SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const address = text(body.address, 255);

  if (address === '') return badRequest('invalid_address');

  // The sheet's own field has no label on it, so one is derived rather than
  // demanded: the API requires a label and an empty one would 422 a form that
  // asked for a single line.
  const label = text(body.label, 40) || address.slice(0, 40);
  const note = text(body.note, 255);

  let existing: readonly ApiAddress[] = [];

  try {
    const response = await fetch(`${apiBase()}/mp/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Refused here rather than sent on. Writing a book of one over an account
      // whose rows this handler could not read is how somebody's home address
      // disappears because the API blinked.
      return NextResponse.json({ error: 'address_book_unreadable' }, { status: 502 });
    }

    const payload = (await response.json()) as { data?: { addresses?: ApiAddress[] } };

    existing = payload.data?.addresses ?? [];
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (existing.length >= MAX_ADDRESSES) {
    return NextResponse.json({ error: 'address_book_full' }, { status: 422 });
  }

  const addresses = [
    ...existing.map((row) => ({
      label: row.label,
      address: row.address,
      note: row.note,
      latitude: row.latitude,
      longitude: row.longitude,
      is_default: row.is_default,
    })),
    { label, address, note: note === '' ? null : note, is_default: existing.length === 0 },
  ];

  return mpForward(request, '/mp/me/addresses', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  });
}
