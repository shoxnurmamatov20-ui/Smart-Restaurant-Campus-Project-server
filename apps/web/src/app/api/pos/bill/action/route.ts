import { NextResponse, type NextRequest } from 'next/server';

/**
 * The action's own id, minted by the *client*.
 *
 * `X-Pos-Local-Id` is the POS module's idempotency and it identifies an
 * **action**, not an HTTP request. Minting it here — one fresh uuid per
 * request — undid the whole mechanism: a waiter who taps Send, loses the
 * answer and taps again sends two different ids, and the server has no way to
 * know it is the same docket. It fires twice and the kitchen cooks twice.
 *
 * So it comes off the request when the caller supplies one, and is only minted
 * here as a fallback for a caller that has not been updated yet. The offline
 * queue supplies the id it first gave the entry, which is what makes a replayed
 * shift replay rather than duplicate.
 */
const localIdFrom = (request: NextRequest): string =>
  request.headers.get('X-Pos-Local-Id') ?? crypto.randomUUID();

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * The five things a waiter does to a bill that are not adding a dish.
 *
 * Void a line, discount, split, merge, transfer. One handler because they are
 * the same request with a different path and body: the same two credentials,
 * the same tenant header, the same pair of idempotency keys. Five files would
 * be this file's plumbing copied five times, and the copies would drift.
 *
 * The action is a key into a fixed table rather than a path fragment taken from
 * the request. A caller cannot reach an endpoint this file does not name, which
 * matters because the shift token in the cookie is a real credential and this
 * route is reachable from the browser.
 *
 * Nothing here decides money or permission. The API prices the bill and the API
 * decides whether this shift may discount by that much; a client that could
 * answer either could disagree with the receipt or with the rules.
 */
type Action = 'void-line' | 'discount' | 'split' | 'merge' | 'transfer';

/** `line` is filled in from the body, and only for the one action that has one. */
const PATHS: Readonly<Record<Action, (bill: string, line?: string) => string>> = {
  'void-line': (bill, line) => `/pos/bills/${bill}/lines/${line}`,
  discount: (bill) => `/pos/bills/${bill}/discount`,
  split: (bill) => `/pos/bills/${bill}/split`,
  merge: (bill) => `/pos/bills/${bill}/merge`,
  transfer: (bill) => `/pos/bills/${bill}/transfer`,
};

const METHODS: Readonly<Record<Action, 'POST' | 'DELETE'>> = {
  'void-line': 'DELETE',
  discount: 'POST',
  split: 'POST',
  merge: 'POST',
  transfer: 'POST',
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message_uz?: string;
    detail?: string;
    errors?: Record<string, string[]>;
    /**
     * What rides along with `pos.approval_required`.
     *
     * `ApprovalGate` raises the request itself when it refuses, so the id of
     * the thing a manager has to sign already exists by the time the till hears
     * about the refusal. Passed on rather than dropped, because without it the
     * screen knows only that *somebody* must sign *something*: it cannot open a
     * keypad against that request, and — the part that actually breaks — it
     * cannot send the id back on the retry, which is the only way the gate lets
     * an approved action through (`BillController::gate()` refuses again when
     * `approval_id` is absent, however signed the approval is).
     *
     * It sits BESIDE `code` rather than under a `meta` object, and that is the
     * API's envelope rather than an accident: `ApiError::toArray()` ends with
     * `[...$body, ...$meta]` and says why — *"It rides alongside the four fixed
     * keys rather than inside them, so a client that does not know a particular
     * code can still render the message."*
     *
     * This was read as `error.meta.approval_id` and was therefore always
     * undefined: every refusal reached the till without an id, the keypad had
     * nothing to poll, and the retry was refused again by the gate. The whole
     * approval flow looked broken from the floor and correct from the server.
     */
    approval_id?: unknown;
  };
};

const isAction = (value: unknown): value is Action => typeof value === 'string' && value in PATHS;

export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { action, bill_id: billId, line_id: lineId, ...payload } = body;

  if (!isAction(action)) {
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }

  if (typeof billId !== 'number' || !Number.isInteger(billId) || billId < 1) {
    return NextResponse.json({ error: 'invalid_bill' }, { status: 400 });
  }

  if (action === 'void-line' && (typeof lineId !== 'number' || !Number.isInteger(lineId))) {
    return NextResponse.json({ error: 'invalid_line' }, { status: 400 });
  }

  const path = PATHS[action](String(billId), lineId === undefined ? undefined : String(lineId));

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      method: METHODS[action],
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        /* Both keys, for the reasons set out in ../route.ts. */
        'Idempotency-Key': crypto.randomUUID(),
        'X-Pos-Local-Id': localIdFrom(request),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as ApiErrorBody | null;

    /*
     * The API's own sentence, and its code.
     *
     * The code matters here more than anywhere else in the POS: a discount over
     * the role's ceiling comes back as a refusal that a manager's PIN can turn
     * into an approval, and a closed bill comes back as one that nothing can.
     * The screen needs to tell those apart to decide whether to open the
     * keypad.
     */
    const approvalId = detail?.error?.approval_id;

    return NextResponse.json(
      {
        error: 'rejected',
        code: detail?.error?.code,
        approvalId: typeof approvalId === 'number' ? approvalId : null,
        message:
          detail?.error?.detail ??
          detail?.error?.errors?.reason?.[0] ??
          detail?.error?.errors?.percent?.[0] ??
          detail?.error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(await upstream.json());
}
