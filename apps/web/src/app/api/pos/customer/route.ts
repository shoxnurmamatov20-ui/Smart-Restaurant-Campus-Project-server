import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Who is on the phone.
 *
 * A takeaway or a delivery is opened against a **customer**, not against a
 * free-text name: `BillRegistry::open()` takes a `customer_id`, and that id is
 * what carries the loyalty balance, the credit limit and the address history.
 * Sending a name and a phone number in the bill body would be sending fields
 * `OpenBillRequest` drops on the floor — the order would open anonymously and
 * nobody would know until the guest asked why their points had not moved.
 *
 * So the till looks the number up first. A hit gives an id; a miss gives null
 * and the till opens the bill without one, which is the honest outcome for a
 * first-time caller.
 *
 * Enrolling a first-time caller from the till goes through `POST /v1/crm/customers`.
 * The cashier role holds `crm.create` since 2026-08-22 — the narrower
 * `POST /v1/pos/customers` was considered and rejected, because a till that
 * can create a guest but not see the one it just created would have to ask a
 * second endpoint for the id it needs. `DesignRoleMatrixTest` still asserts
 * the cashier cannot `crm.delete`, which is the grant that actually matters.
 */
export async function GET(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  const phone = request.nextUrl.searchParams.get('phone');
  const id = request.nextUrl.searchParams.get('id');

  /*
   * Two ways in, one answer out.
   *
   * By **phone** when a caller is being taken: the till has a number and no id.
   * By **id** when a bill already carries a customer and the pay drawer needs
   * their name and balance before offering a tab — the bill's payload has
   * `customer_id` and nothing else about them, and a drawer offering "charge to
   * account" without saying whose account, or what they already owe, is the one
   * place on that screen where the number matters most.
   */
  const byId = id !== null && /^\d+$/.test(id);

  if (!byId && (phone === null || !/^\+998\d{9}$/.test(phone))) {
    /* `+998` and nine digits. Anything else is not a number this market has. */
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  }

  /*
   * `show` for an id, `index` for a phone.
   *
   * Not `filter[id]` on the list: `CustomerController::index` allows `phone`,
   * `tier`, `is_active` and `name`, and Spatie's query builder **rejects** a
   * filter that is not on that list rather than ignoring it — so the lookup
   * would 400 and this handler would report "no such customer" about somebody
   * who exists.
   */
  const url = byId
    ? `${apiBase()}/crm/customers/${encodeURIComponent(id ?? '')}`
    : `${apiBase()}/crm/customers?filter[phone]=${encodeURIComponent(phone ?? '')}&per_page=1`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      /* A refusal is not a miss. The till opens the bill either way, so this
         answers "no id" rather than an error the waiter has to read. */
      return NextResponse.json({ data: null });
    }

    /* `show` answers with one object under `data`, `index` with an array. */
    const body = (await upstream.json()) as {
      data?:
        | { id: number; name?: string; balance?: number }[]
        | { id: number; name?: string; balance?: number };
    };

    const found = Array.isArray(body.data) ? body.data[0] : body.data;

    return NextResponse.json({
      data:
        found === undefined
          ? null
          : { id: found.id, name: found.name ?? null, balance: found.balance ?? 0 },
    });
  } catch {
    return NextResponse.json({ data: null });
  }
}
