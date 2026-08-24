import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * What the console does to one order.
 *
 * Read on the left, write on the right, one file, because both halves are the
 * same plumbing: the person's own token off the httpOnly cookie, the API's own
 * refusal passed through with its code and its three sentences. A browser
 * cannot hold that token — a token JavaScript can read is a token an injected
 * script can post somewhere — so nothing here is reachable from the API
 * directly. See lib/api-proxy.ts.
 *
 * Two screens share it, and that is deliberate rather than convenient. The
 * orders table's drawer reprints a receipt, voids, refunds, discounts and
 * moves; the intake queue accepts and declines the same rows and puts a rider
 * on them. They are one module's endpoints seen from two desks, and two
 * handlers would be this file's plumbing written twice.
 *
 * Three modules answer between them — Orders for the bill, Finance for the
 * money, Kitchen for the paper — which is the other reason the switch is here
 * rather than on the screen: the drawer asks for a thing to happen to an
 * order, and which module owns that verb is not the drawer's business.
 *
 * The action is a key into a fixed table, never a path fragment taken off the
 * request. This route is reachable from the browser with a real session behind
 * it, and interpolating a caller's string into an upstream path would point the
 * reader's own token at any endpoint it happens to reach.
 */

/** `GET /api/v1/orders/orders/{id}?include=items` — the drawer's own lines. */
export async function GET(request: NextRequest) {
  const id = whole(Number(request.nextUrl.searchParams.get('id')));

  if (id === null) return badRequest('invalid_order');

  return forward(request, `/orders/orders/${id}?include=items`, { method: 'GET' });
}

type Body = {
  action?: unknown;
  orderId?: unknown;
  courierId?: unknown;
  /** `create`: the cart, and what the operator was told on the telephone. */
  items?: unknown;
  delivery?: unknown;
  payment?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  address?: unknown;
  deliveryFee?: unknown;
  /** Void, refund and discount all take one, and none of them without it. */
  reason?: unknown;
  /** Discount: tiyin off the bill, or a share of the subtotal. One or the other. */
  amount?: unknown;
  percent?: unknown;
  /** A signature already granted, spent rather than asked for a second time. */
  approvalId?: unknown;
  /** Transfer: where the bill goes, and whose evening carries it. */
  tableId?: unknown;
  tableLabel?: unknown;
  waiterId?: unknown;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * A reason the ledger can be read from, or null.
 *
 * Three characters, the same floor `DiscountRequest` enforces upstream. The
 * screen checks it too, so nobody finds out after a round trip — this is the
 * copy that matters, because it is the last one before a real token goes up.
 */
function reasonFrom(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  return trimmed.length < 3 || trimmed.length > 255 ? null : trimmed;
}

/** The four sentences and two flags every envelope carries — API.md §1. */
const ENVELOPE_KEYS = new Set([
  'code',
  'message_uz',
  'message_ru',
  'message_en',
  'field',
  'retryable',
]);

/**
 * The refusal, with what it came WITH where the browser can reach it.
 *
 * `ApiError::toArray()` spreads its meta *alongside* the four fixed keys —
 * `error.approval_id`, `error.detail` — while `lib/console-post.ts` reads a
 * top-level `meta`, so today a screen using `post()` sees the code and the
 * sentence and nothing else. For three of these four actions that is the
 * difference between a usable refusal and an unusable one: `order.refused`
 * says which rule the bill broke in `detail`, and `order.approval_required`
 * carries the id of the request a manager now has to sign — without which the
 * console cannot re-send and would raise a *second* request in that manager's
 * queue every time somebody pressed the button again.
 *
 * So the error object is passed through untouched and the extra keys are
 * copied up to `meta` as well. Additive rather than a reshape, which is the
 * difference between this and `api/pos/bill/action/route.ts`: a client that
 * knows the envelope still reads exactly what the API sent.
 */
async function withMeta(answer: NextResponse): Promise<NextResponse> {
  if (answer.ok) return answer;

  const body = (await answer.json().catch(() => null)) as Record<string, unknown> | null;

  // `forward` has already parsed the API's answer and re-serialised it, so an
  // unreadable body at this point is this handler's own doing rather than the
  // API's — and it is still an answer the screen must not read as a success.
  if (body === null) return NextResponse.json({ error: 'unreadable_answer' }, { status: 502 });

  const error = body.error;

  // `forward` answers its own failures with a plain string — `api_unreachable`,
  // `not_signed_in` — and those carry nothing to lift.
  if (typeof error !== 'object' || error === null) {
    return NextResponse.json(body, { status: answer.status });
  }

  const meta = Object.fromEntries(
    Object.entries(error as Record<string, unknown>).filter(([key]) => !ENVELOPE_KEYS.has(key)),
  );

  return NextResponse.json(Object.keys(meta).length === 0 ? body : { ...body, meta }, {
    status: answer.status,
  });
}

/**
 * A refusal this handler decided on, in the API's own envelope.
 *
 * No sentences: the three languages for a code the API never heard of would be
 * a fourth catalogue living in a route handler. The screen holds the copy and
 * branches on the code, which is what `PostResult.code` is for.
 */
const refuse = (code: string): NextResponse =>
  NextResponse.json({ error: { code } }, { status: 409 });

/**
 * An order taken over the telephone — `POST /api/v1/orders/orders`.
 *
 * The intake desk's compose flow, and the one verb here that creates rather
 * than changes. It posts the whole thing in one request: the guest, the
 * address, the tender and every line, because an operator builds a cart while
 * somebody is still on the line and a connection that dropped between line two
 * and line three would leave a half-order on a pass.
 *
 * **No price crosses this boundary.** Only `menu_item_id` and a quantity; the
 * catalogue is asked, per line, inside the API's own transaction. That rule is
 * the same one `PublicOrderController` states for a stranger with a phone, and
 * it holds here for a different reason: an operator IS trusted with money off a
 * bill, and that trust runs through the approval ladder rather than through a
 * number in a request body.
 *
 * `source` and `intake_channel` are two axes and both are set: the software
 * that posted this is the console (`pos`), and the conversation was a telephone
 * call (`phone`). Neither can be derived from the other — an aggregator covers
 * three contracts, and a call typed up by a supervisor is still a call.
 *
 * `status: 'placed'` rather than `draft`: an order an operator has read back to
 * a guest is an order, and leaving it in draft would mean a kitchen that never
 * hears about it until somebody remembers to fire it.
 */
async function create(request: NextRequest, body: Body): Promise<NextResponse> {
  const raw = Array.isArray(body.items) ? body.items : [];

  const items = raw
    .map((line) => {
      const entry = (line ?? {}) as { menuItemId?: unknown; quantity?: unknown };

      return { menu_item_id: whole(entry.menuItemId), quantity: whole(entry.quantity) };
    })
    .filter(
      (line): line is { menu_item_id: number; quantity: number } =>
        line.menu_item_id !== null && line.quantity !== null && line.quantity <= 99,
    );

  // An empty basket is not an order. Refused here rather than upstream so the
  // screen gets the answer without a round trip and a real token stays put.
  if (items.length === 0 || items.length > 40) return badRequest('invalid_items');

  const delivery = body.delivery === true;
  const text = (value: unknown, limit: number): string | null => {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();

    return trimmed === '' || trimmed.length > limit ? null : trimmed;
  };

  /*
   * The design's three tender chips against the column's three words.
   *
   * `click` is a brand and `online` is what the bill records — an order settled
   * through Payme and one through Click are the same fact to a kitchen and to a
   * courier, and the provider is the payment's business rather than the order's.
   */
  const payment =
    body.payment === 'card' ? 'card_on_delivery' : body.payment === 'click' ? 'online' : 'cash';

  const fee = whole(body.deliveryFee);

  return withMeta(
    await forward(request, '/orders/orders', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        channel: delivery ? 'delivery' : 'takeaway',
        status: 'placed',
        source: 'pos',
        intake_channel: 'phone',
        customer_name: text(body.customerName, 120),
        customer_phone: text(body.customerPhone, 32),
        delivery_address: delivery ? text(body.address, 255) : null,
        payment_method: payment,
        delivery_fee: delivery && fee !== null ? Math.min(fee, 10_000_000) : 0,
        items,
      }),
    }),
  );
}

/** `GET /api/v1/finance/payments`, narrowed to the two facts a refund needs. */
type ApiPayment = { id: number; status: string };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  /*
   * Opening one is the exception: there is no order yet to name.
   *
   * Handled before the id is required rather than inside the switch below,
   * because every other verb here happens TO a bill and this one makes it.
   */
  if (body.action === 'create') return create(request, body);

  const orderId = whole(body.orderId);

  // A fixture row has no id, and `apiId()` on the screen answers null for one.
  // Refused here as well rather than trusted: this is the last place before a
  // real token reaches the API.
  if (orderId === null) return badRequest('invalid_order');

  switch (body.action) {
    case 'accept':
      /*
       * One rung of the ladder, not a free choice of state.
       *
       * `changeStatus` enforces the ladder and refuses an illegal jump, so the
       * worst a wrong value could do is 422 — but the intake queue only ever
       * means one thing by "Qabul qilish", and letting the browser name the
       * state would be a screen that could mark food cooked from the phone.
       */
      return forward(request, `/orders/orders/${orderId}/status`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: 'accepted' }),
      });

    case 'decline':
      /*
       * A constant reason, and the one case where that is honest.
       *
       * `cancel` requires one — a void with no reason is what makes a
       * loss-prevention report unreadable — and the intake queue has no field
       * to type in, because a declined order has exactly one reason: the
       * operator declined it. A machine value rather than a sentence, for the
       * reason `queueFrom()` gives about `void_line`: a contract value both
       * ends name beats three translations that drift. A void from the orders
       * drawer is the opposite case and is deliberately not here — those
       * reasons genuinely differ, and a constant would make every one of them
       * say the same useless thing.
       */
      return forward(request, `/orders/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason: 'operator_declined' }),
      });

    case 'print':
      /*
       * The guest's receipt again, spooled by the print module.
       *
       * `POST /kitchen/receipts` takes `order_id` because a POS bill *is* the
       * order — `BillRegistry::find()` resolves the same row — so the drawer
       * has the id it needs without knowing anything about the till. It
       * answers 202: the paper is queued, and whether it printed is the
       * agent's news, not this response's.
       */
      return forward(request, '/kitchen/receipts', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ order_id: orderId }),
      });

    case 'courier': {
      const courierId = whole(body.courierId);

      if (courierId === null) return badRequest('invalid_courier');

      return forward(request, `/orders/orders/${orderId}/assign-courier`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ courier_user_id: courierId }),
      });
    }

    case 'void': {
      /*
       * The drawer's void, and the opposite case to `decline` above.
       *
       * A back-office void has as many reasons as there are evenings — a guest
       * who left, a duplicate ticket, a dish nobody could eat — and the reason
       * is the entire value of the row in the loss-prevention report. So the
       * sentence comes from the person, and a closed bill comes back as
       * `order.closed` rather than being guessed at here.
       */
      const reason = reasonFrom(body.reason);

      if (reason === null) return badRequest('invalid_reason');

      return withMeta(
        await forward(request, `/orders/orders/${orderId}/cancel`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ reason }),
        }),
      );
    }

    case 'discount': {
      /*
       * Money off a bill, from a desk rather than a till.
       *
       * `/pos/bills/{id}/discount` sits behind `RequireTerminalSession` and
       * refuses a console token on purpose. `BillActionController` is the
       * Orders-side door for the same operation — same `BillRegistry`, same
       * P9 signature rule, `orders.manage` instead of `pos.sell` — so this is
       * a forward and not a proxy around the till's guard.
       *
       * Either shape goes up, never both: an operator waiving a delivery fee
       * types so'm, a manager apologising for a wait picks a percentage, and
       * the server converts the second into the first through the one rule the
       * till also reads.
       */
      const reason = reasonFrom(body.reason);

      if (reason === null) return badRequest('invalid_reason');

      const amount = whole(body.amount);
      const percent = whole(body.percent);

      if (amount === null && percent === null) return badRequest('invalid_discount');
      if (percent !== null && percent > 100) return badRequest('invalid_discount');

      const approvalId = whole(body.approvalId);

      return withMeta(
        await forward(request, `/orders/orders/${orderId}/discount`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            reason,
            ...(percent === null ? { amount } : { percent }),
            // Absent on the first ask. Present on the re-send, and it is the
            // only thing that lets an approved request through: the gate
            // refuses again when it is missing, however signed the approval.
            ...(approvalId === null ? {} : { approval_id: approvalId }),
          }),
        }),
      );
    }

    case 'transfer': {
      /*
       * Where the bill sits, and whose evening carries it.
       *
       * A label with no id is deliberately not enough. `EloquentBillRegistry
       * ::transfer()` writes `table_label` only inside the `tableId !== null`
       * branch — the label is denormalised so that renaming a table later does
       * not rewrite where a past bill was served — so a label sent alone
       * validates, answers 200 and moves nothing, which is precisely the "tell
       * the console something happened" failure the endpoint refuses an empty
       * body to avoid.
       */
      const tableId = whole(body.tableId);
      const waiterId = whole(body.waiterId);

      if (tableId === null && waiterId === null) return badRequest('invalid_transfer');

      const label = typeof body.tableLabel === 'string' ? body.tableLabel.trim().slice(0, 32) : '';

      return withMeta(
        await forward(request, `/orders/orders/${orderId}/transfer`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            ...(tableId === null ? {} : { table_id: tableId, table_label: label || null }),
            ...(waiterId === null ? {} : { waiter_user_id: waiterId }),
          }),
        }),
      );
    }

    case 'refund': {
      /*
       * Two calls, because a refund is addressed by payment and the drawer
       * knows only the order.
       *
       * The lookup happens here rather than in the browser for the reason every
       * write on this platform is proxied: it is the same token and the same
       * hop, and a screen that had to fetch a payment list first would be a
       * screen holding payment ids it has no other use for.
       *
       * Which payment is the whole question. `captured` is the only refundable
       * status the model has, and a bill settled with two tenders — half cash,
       * half card — has two of them. Reversing one silently would hand back
       * part of the money and record it as the whole; that choice belongs to
       * somebody looking at both rows, so it is refused with a code the screen
       * has words for.
       */
      const reason = reasonFrom(body.reason);

      if (reason === null) return badRequest('invalid_reason');

      // `filter[order]` is `PaymentController`'s own allowed filter, an exact
      // match on `order_id`. Fifty is far past what a single bill can carry
      // and well inside the endpoint's ceiling of a hundred.
      const ledger = `/finance/payments?filter[order]=${orderId}&per_page=50`;
      const list = await forward(request, ledger, { method: 'GET' });

      // `finance.view` is a separate permission from `orders.manage`, so this
      // is a refusal a real reader can hit. Passed through with its own
      // sentence rather than flattened into "no payment found".
      if (!list.ok) return withMeta(list);

      const payments = ((await list.json()) as { data?: ApiPayment[] }).data ?? [];
      const captured = payments.filter((payment) => payment.status === 'captured');

      if (captured.length === 0) return refuse('refund.nothing_captured');
      if (captured.length > 1) return refuse('refund.several_payments');

      return withMeta(
        await forward(request, `/finance/payments/${captured[0].id}/refund`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ reason }),
        }),
      );
    }

    default:
      return badRequest('unknown_action');
  }
}
