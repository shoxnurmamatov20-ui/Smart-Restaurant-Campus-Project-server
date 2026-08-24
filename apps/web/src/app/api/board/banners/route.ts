import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A strip on the menu board — `POST /api/v1/board/banners`.
 *
 * The console's Board screen drew an "add banner" button that flashed a
 * sentence listing the fields a form would ask for and opened nothing. The
 * endpoint has been there the whole time; what was missing was the door.
 *
 * Three languages, all required, and that is the API's rule rather than this
 * handler's invention: a banner is a sentence making a promise about a price,
 * and one printed only in Uzbek on a wall where half the queue reads Russian is
 * an offer half the queue cannot claim. Checked here as well so a half-filled
 * form fails with a named error the panel can word, rather than as a 422 it has
 * to unpack.
 *
 * The slug is derived rather than asked for. It is a key, not copy — nothing on
 * the wall or in the panel shows it — and a form that made a manager invent one
 * would be a form with a field nobody can answer. `BoardBanner` scopes
 * uniqueness to the venue, so the suffix is what keeps two "Osh -20%" strips in
 * two months from colliding.
 */
type Body = {
  text?: unknown;
  kind?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  isLive?: unknown;
};

/** `BoardBanner::KINDS`. */
const KINDS: readonly string[] = ['offer', 'new', 'loyalty'];

/** The API's own ceiling on a line of wall text. */
const MAX_TEXT = 120;

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * A key from a sentence: lower case, latin letters and digits, hyphen-joined.
 *
 * Uzbek is written in latin here, so most banners produce something readable.
 * Russian and other scripts fall through to nothing, which is why the caller
 * always appends a suffix and why `banner` is the floor — a slug the regex
 * would refuse is worse than an opaque one.
 */
export function slugify(text: string): string {
  const key = text
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');

  return key === '' ? 'banner' : key;
}

/** The slug this banner is stored under, unique within the venue. */
export function slugFor(text: string, now: number): string {
  // Base 36 of the minute, which is short, sorts and cannot repeat inside a
  // session. Kept under the column's 48 characters by the slice above.
  return `${slugify(text)}-${Math.floor(now / 60_000).toString(36)}`;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const source = body.text;

  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return badRequest('invalid_text');
  }

  const text = source as Record<string, unknown>;
  const uz = trimmed(text.uz);
  const ru = trimmed(text.ru);
  const en = trimmed(text.en);

  if (uz === '' || ru === '' || en === '') return badRequest('text_required');
  if (uz.length > MAX_TEXT || ru.length > MAX_TEXT || en.length > MAX_TEXT) {
    return badRequest('text_too_long');
  }

  const kind = trimmed(body.kind);

  if (!KINDS.includes(kind)) return badRequest('invalid_kind');

  /*
   * A window is optional, and both ends have to be a date when they are given.
   * The API refuses an end before its start; that rule is not copied here
   * because a second copy of it is the one that goes stale.
   */
  const startsAt = dateOrNull(body.startsAt);
  const endsAt = dateOrNull(body.endsAt);

  if (startsAt === false || endsAt === false) return badRequest('invalid_window');

  return forward(request, '/board/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: slugFor(uz, Date.now()),
      text: { uz, ru, en },
      kind,
      starts_at: startsAt,
      ends_at: endsAt,
      // Off unless the person said otherwise. A strip that went onto the wall
      // the instant it was typed is a strip nobody proof-read.
      is_live: body.isLive === true,
    }),
  });
}

/** `null` for absent, the string for a date, `false` for something else. */
function dateOrNull(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return false;

  return Number.isNaN(Date.parse(value)) ? false : value;
}
