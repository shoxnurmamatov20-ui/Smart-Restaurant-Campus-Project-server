import { NextResponse, type NextRequest } from 'next/server';

import { crewBadRequest, crewBody, crewCall, crewWhole } from '../../crew-proxy';

/**
 * A waiter firing an order from the floor.
 *
 * The order pad recorded nothing for as long as it existed: it cleared the
 * basket, said "sent" and the kitchen never heard. The endpoints were there the
 * whole time — a waiter holds `orders.create` and `orders.update` — and this is
 * the seam that was missing.
 *
 * ---------------------------------------------------------------------------
 * Open or append, decided here rather than on the phone
 *
 * A table already sitting has an open bill and the new plates belong on it; an
 * empty table needs one opened first. Two calls, and which one to make is a
 * question about the current state of the floor — so it is answered on the
 * server, against a read taken in the same request, rather than from whatever
 * the phone last rendered. A phone deciding this from a stale screen opens a
 * second bill on a table that already has one, and the guest is handed two.
 *
 * ---------------------------------------------------------------------------
 * The price is never sent
 *
 * `POST orders/{order}/items` takes `menu_item_id`, `quantity` and a note, and
 * copies the name, SKU, station and **price** off the Menu at that moment. That
 * is the rule that keeps a guest from being charged a figure a handset had
 * cached since lunchtime, and it is why nothing on this route carries money.
 *
 * ---------------------------------------------------------------------------
 * Line by line, and a refusal is reported per line
 *
 * A dish the kitchen 86'd between the tap and the send comes back
 * `stop_list.item_unavailable`, and the waiter has to be told **which** one — a
 * whole order refused over one plate would be re-keyed from scratch with a
 * guest watching. So each line is answered separately and the rest still land.
 */
type Body = {
  tableId?: unknown;
  tableLabel?: unknown;
  orderId?: unknown;
  lines?: unknown;
};

type IncomingLine = { menuItemId?: unknown; quantity?: unknown; note?: unknown };

type ApiOrderRow = { id: number };

export async function POST(request: NextRequest) {
  const body = await crewBody<Body>(request);

  if (body === null || !Array.isArray(body.lines) || body.lines.length === 0) {
    return crewBadRequest('invalid_body');
  }

  const lines: { menu_item_id: number; quantity: number; note: string | null }[] = [];

  for (const raw of body.lines as IncomingLine[]) {
    const menuItemId = crewWhole(raw.menuItemId);
    const quantity = crewWhole(raw.quantity);

    // A fixture dish, or a row somebody cleared to zero. Skipped rather than
    // refused: an order of eight must not be thrown away over one of them.
    if (menuItemId === null || quantity === null) continue;

    lines.push({
      menu_item_id: menuItemId,
      quantity: Math.min(quantity, 99),
      note: typeof raw.note === 'string' && raw.note !== '' ? raw.note.slice(0, 500) : null,
    });
  }

  if (lines.length === 0) return crewBadRequest('no_live_dishes');

  const tableId = crewWhole(body.tableId);

  if (tableId === null) return crewBadRequest('not_a_live_table');

  let orderId = crewWhole(body.orderId);

  /*
   * No bill on the screen. Ask the floor rather than trusting it: the table may
   * have been opened by somebody else in the minutes since this page rendered,
   * and opening a second bill on it is the one mistake here a guest sees.
   */
  if (orderId === null) {
    const open = await crewCall(
      request,
      `/orders/orders?per_page=1&filter[table]=${tableId}&filter[open]=true`,
    );

    if (open === 'not_signed_in') return unsigned();
    if (open === null) return unreachable();

    if (open.ok) {
      const payload = (await open.json().catch(() => null)) as { data?: ApiOrderRow[] } | null;

      orderId = payload?.data?.[0]?.id ?? null;
    }
  }

  if (orderId === null) {
    const opened = await crewCall(request, '/orders/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_table_id: tableId,
        table_label: typeof body.tableLabel === 'string' ? body.tableLabel.slice(0, 32) : null,
        /*
         * Dine-in, and that is not a placeholder: this route hangs off a table,
         * so there is no other channel it could be. The service charge follows
         * from the channel and is applied by the server, never by the phone.
         */
        channel: 'dine_in',
      }),
    });

    if (opened === 'not_signed_in') return unsigned();
    if (opened === null) return unreachable();

    const payload = (await opened.json().catch(() => null)) as { data?: ApiOrderRow } | null;

    if (!opened.ok || payload?.data?.id === undefined) {
      return NextResponse.json(payload ?? { error: 'rejected' }, { status: opened.status });
    }

    orderId = payload.data.id;
  }

  const results: { menu_item_id: number; ok: boolean; code?: string }[] = [];

  for (const line of lines) {
    const answer = await crewCall(request, `/orders/orders/${orderId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(line),
    });

    if (answer === 'not_signed_in') return unsigned();

    if (answer === null) {
      results.push({ menu_item_id: line.menu_item_id, ok: false, code: 'api_unreachable' });

      continue;
    }

    if (answer.ok) {
      results.push({ menu_item_id: line.menu_item_id, ok: true });

      continue;
    }

    const refusal = (await answer.json().catch(() => null)) as { error?: { code?: string } } | null;

    results.push({
      menu_item_id: line.menu_item_id,
      ok: false,
      code: refusal?.error?.code ?? `http_${answer.status}`,
    });
  }

  return NextResponse.json({
    data: {
      order_id: orderId,
      results,
      sent: results.filter((result) => result.ok).length,
      refused: results.filter((result) => !result.ok).length,
    },
  });
}

const unsigned = () => NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
const unreachable = () => NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
