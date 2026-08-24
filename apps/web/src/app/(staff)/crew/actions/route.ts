import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

import { CREW_SESSION_COOKIE, CREW_TENANT_COOKIE } from '../../crew-session';

/**
 * The staff app's queue, handed over — `POST /api/v1/staff/actions`.
 *
 * For as long as this surface existed its buttons recorded nothing: every panel
 * carried a strip saying "your answer stays on this phone", and it was true.
 * The endpoint exists now — one batch, eight verbs, a verdict per entry — and
 * this is the seam it was waiting for. The phone build already drains through
 * it (`apps/mobile/src/crew/queue.ts`); this is the same drain from a browser.
 *
 * **Node calls Laravel, not the browser.** The shift session is an httpOnly
 * cookie, deliberately: a staff phone is passed between two people on a shift
 * and left on a pass, and a token JavaScript can read is a token that leaves in
 * the first piece of injected script. Nothing in the browser bundle has ever
 * seen it, so the browser posts here and this forwards it.
 *
 * **One request for the whole batch, in the order the work was done.** Not a
 * tidiness preference: sent out of order, a cancellation overtakes the line it
 * cancels and the kitchen cooks a dish the guest already sent back. The server
 * applies them in the order they arrive.
 *
 * **`local_id` is the client's and never changes.** The server keys on it per
 * person, so a batch resent after a dropped connection writes nothing twice and
 * gets the *stored verdict* back rather than "duplicate" — which matters,
 * because a phone told `rejected` the first time has to be told it again or it
 * will keep the entry and ask forever.
 */

/**
 * The ten verbs `StaffActionController` knows.
 *
 * Checked here as well as upstream, and not out of distrust: a ninth word
 * reaching Laravel costs the whole batch a 422, so twelve good entries would be
 * refused because of one the screen should never have queued. Filtering at the
 * door keeps one bad entry the client's problem.
 */
const KINDS = [
  'clock_in',
  'clock_out',
  'table_claim',
  'call_resolve',
  'count_submit',
  'receive_confirm',
  'waste_log',
  'delivery_status',
  'cash_handover',
  'checklist_tick',
] as const;

type Kind = (typeof KINDS)[number];

const isKind = (value: unknown): value is Kind =>
  typeof value === 'string' && (KINDS as readonly string[]).includes(value);

type IncomingEntry = {
  local_id?: unknown;
  kind?: unknown;
  at?: unknown;
  payload?: unknown;
};

/** How many entries one drain may carry. The server's own ceiling. */
const MAX_ENTRIES = 50;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(CREW_SESSION_COOKIE)?.value;
  const tenant = request.cookies.get(CREW_TENANT_COOKIE)?.value;

  /*
   * Both, or nothing is sent.
   *
   * A device token carries no user, so `ResolveTenant` has nothing to infer the
   * restaurant from and the request would be refused upstream anyway. Answered
   * as its own status so the queue screen can say "sign in again" rather than
   * showing the person a network error about their own session.
   */
  if (token === undefined || tenant === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let body: { entries?: unknown };

  try {
    body = (await request.json()) as { entries?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'nothing_to_send' }, { status: 400 });
  }

  const entries: { local_id: string; kind: Kind; at: string; payload: Record<string, unknown> }[] =
    [];

  for (const raw of (body.entries as IncomingEntry[]).slice(0, MAX_ENTRIES)) {
    const localId = typeof raw.local_id === 'string' ? raw.local_id.slice(0, 64) : '';
    const at = typeof raw.at === 'string' ? raw.at : '';

    // Dropped rather than refused: one malformed entry must not strand the
    // eleven beside it, which is the same rule the controller applies per verb.
    if (localId === '' || at === '' || !isKind(raw.kind)) continue;

    entries.push({
      local_id: localId,
      kind: raw.kind,
      /*
       * When it happened, not when it was sent.
       *
       * The server stamps the trading day from this, so a night's work drained
       * the next morning still belongs to the night — and a clock-in queued at
       * 08:03 and drained at 14:00 must not pay somebody from two in the
       * afternoon.
       */
      at,
      payload:
        typeof raw.payload === 'object' && raw.payload !== null
          ? (raw.payload as Record<string, unknown>)
          : {},
    });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'nothing_sendable' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/staff/actions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Tenant': tenant,
        /*
         * Fresh per drain rather than derived from the batch.
         *
         * The header guards the *request*; `local_id` guards each entry, which
         * is the case a queue actually produces — twelve sent, nine written,
         * the connection dies, and the retry carries a different, overlapping
         * twelve. A key derived from the batch would refuse that retry whole.
         */
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ entries }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;

  if (!upstream.ok) {
    return NextResponse.json(payload ?? { error: 'rejected' }, { status: upstream.status });
  }

  return NextResponse.json(payload);
}
