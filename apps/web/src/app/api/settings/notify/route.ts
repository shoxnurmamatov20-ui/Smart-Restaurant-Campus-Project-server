import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * Which chat hears about what, saved.
 *
 * The notification panel draws six switches and a chat id; this turns them into
 * rows on `telegram.notification_rules`. Proxied like everything else in this
 * app, because the session token is an httpOnly cookie the browser cannot read.
 *
 * ---------------------------------------------------------------------------
 * The six switches against the events the platform actually publishes
 *
 * The panel's keys are what a manager calls things — "cash", "void", "shift" —
 * and the server's are domain event names. The map is here rather than in the
 * panel because it is a fact about the API, and `NotificationRule::EVENTS` is a
 * closed set: a key with no event would save a switch that looks on and waits
 * forever for a message that was never coming.
 *
 * `target` has no event yet — nothing publishes "the branch hit its target" —
 * so it is absent rather than mapped to something adjacent, and the save skips
 * it. A switch quietly bound to the wrong event is worse than one that does
 * nothing, because it fires.
 */
const EVENTS: Readonly<Record<string, string>> = {
  cash: 'finance.shift_closed',
  stock: 'menu.dish.stopped',
  disc: 'pos.approval_requested',
  void: 'pos.bill_voided',
  shift: 'finance.shift_closed',
};

type Payload = {
  chat?: unknown;
  on?: unknown;
  /** `save` writes the rules; `test` sends one message to prove the chat works. */
  action?: unknown;
};

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Payload | null;
  const chat = String(body?.chat ?? '');

  // The same shape the server enforces, checked here too so an obviously wrong
  // id costs no round trip: a group is negative and long, a person is positive.
  if (!/^-?\d{6,20}$/.test(chat)) {
    return NextResponse.json({ error: 'invalid_chat' }, { status: 400 });
  }

  const on = (body?.on ?? {}) as Record<string, unknown>;
  const wanted = Object.keys(EVENTS).filter((key) => on[key] === true);
  const events = [...new Set(wanted.map((key) => EVENTS[key]!))];

  if (events.length === 0) {
    return NextResponse.json({ error: 'nothing_selected' }, { status: 400 });
  }

  const created: number[] = [];

  for (const event of events) {
    const rule = await save(token, { event, chat_id: chat });

    if (rule === null) {
      return NextResponse.json({ error: 'rejected' }, { status: 502 });
    }

    created.push(rule);
  }

  if (body?.action !== 'test') {
    return NextResponse.json({ saved: created.length });
  }

  /*
   * One message, to the first rule saved.
   *
   * Testing every rule would put six identical messages in the chat and teach
   * the manager to mute it — which is the exact failure the whole feature is
   * trying to avoid. One is enough to answer the only question: is the bot in
   * this group, and is the id right.
   */
  const probe = await fetch(`${apiBase()}/telegram/notification-rules/${created[0]}/test`, {
    method: 'POST',
    headers: headers(token),
    body: '{}',
    cache: 'no-store',
  }).catch(() => null);

  if (probe === null || !probe.ok) {
    return NextResponse.json({ error: 'not_delivered' }, { status: 502 });
  }

  return NextResponse.json({ saved: created.length, sent: true });
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': crypto.randomUUID(),
  };
}

/** Returns the rule's id, or null when the API refused it. */
async function save(
  token: string,
  rule: { event: string; chat_id: string },
): Promise<number | null> {
  let upstream: Response;

  try {
    // No `/v1` here: `apiBase()` already ends `.../api/v1`. With it, every save
    // asked for `/api/v1/v1/telegram/...`, took the 404 branch and answered
    // `rejected` — so the panel reported a refusal for a rule the API had never
    // been asked about, and no chat was ever bound.
    upstream = await fetch(`${apiBase()}/telegram/notification-rules`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(rule),
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (!upstream.ok) return null;

  const body = (await upstream.json().catch(() => null)) as { data?: { id?: number } } | null;

  return body?.data?.id ?? null;
}
