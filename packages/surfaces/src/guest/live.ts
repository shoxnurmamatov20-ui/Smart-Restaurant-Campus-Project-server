import type { Translated } from './menu-data';
import type { TableLine, TableOrder, TableStep } from './table-data';

/**
 * The wire shapes of `GET /api/v1/public/tables/{token}/order`, and the pure
 * function that turns one into the shape the screens already draw.
 *
 * The mapping lives here, in a package with no React and no `fetch`, for the
 * same reason `crew/live.ts` does: the phone and the browser both render this
 * table and there must not be two opinions about what `cooking` means. The
 * fetch is a pipe; the mapping is the part that is wrong silently.
 *
 * `table-data.ts` said the mapping "happens where the endpoint is written
 * rather than in a screen" — this is that place. The endpoint answers the
 * canonical thirteen-state ladder because that is what the database stores;
 * a guest is shown five.
 */

export type TableOrderLinePayload = {
  id: number | string;
  title?: string | null;
  name?: Translated | string | null;
  quantity: number;
  unit_price: number;
  total_price?: number;
  status?: string | null;
  seat_no?: number | null;
  note?: string | null;
  /**
   * What the guest asked for on this line, as the till recorded it.
   *
   * `PublicTableController` has published both of these all along; the mapper
   * below dropped them, so a guest who asked for no onions and paid for an
   * extra cheese could see neither on their own bill — the one screen whose
   * whole job is letting them check what they are being charged for.
   */
  modifiers?: readonly { name?: Translated | string | null; price?: number | null }[] | null;
};

export type TableOrderPayload = {
  number: string;
  status: string;
  is_open?: boolean;
  table?: { label?: string | null; seats?: number | null; zone?: string | null } | null;
  guests_count?: number | null;
  subtotal: number;
  discount_total?: number;
  service_charge?: number;
  vat_included?: number;
  total: number;
  lines?: readonly TableOrderLinePayload[];
};

/** What the endpoint answers when the table has nothing open. */
export type TableOrderEnvelope = { data: TableOrderPayload | null };

/**
 * Thirteen rungs down to five.
 *
 * The three that end a bill without food — `voided`, `refunded`, `comped` — are
 * deliberately absent rather than mapped to something. A guest whose order was
 * comped has not reached a rung on a cooking ladder, and drawing them at
 * "served" would tell them their food is on the table. The caller treats an
 * unmapped state as "no rung", which is what `stepOf` returning null means.
 *
 * `draft` is absent for the same reason from the other end: a bill nobody has
 * fired has not been sent, whatever the guest's basket looks like.
 */
const GUEST_STEP: Readonly<Record<string, TableStep>> = {
  placed: 'sent',
  accepted: 'accepted',
  cooking: 'cooking',
  ready: 'ready',
  served: 'served',
  // A table's bill waiting to be paid, or paid: the food is on the table, which
  // is the only thing this ladder is about.
  topay: 'served',
  paid: 'served',
  // The two courier rungs cannot happen on a dine-in bill, and are mapped
  // anyway: an order transferred to takeaway mid-meal is rare and real, and a
  // screen that drew nothing would be worse than one that drew "ready".
  enroute: 'ready',
  handed: 'served',
};

export function stepOf(status: string | null | undefined): TableStep | null {
  return status == null ? null : (GUEST_STEP[status] ?? null);
}

/**
 * A line's own rung.
 *
 * `order_items.status` has its own five-value vocabulary — pending, cooking,
 * ready, served, cancelled — which overlaps the bill's but is not the same
 * list. A line that is still `pending` has been sent and not started, which is
 * exactly what the guest ladder calls `sent`.
 */
const LINE_STEP: Readonly<Record<string, TableStep>> = {
  pending: 'sent',
  cooking: 'cooking',
  ready: 'ready',
  served: 'served',
};

/**
 * The order as the screens draw it, or `null` when there is nothing to draw.
 *
 * Null for a table with no open bill AND for a payload that cannot be read.
 * The two are told apart by the caller, which knows whether the request
 * succeeded — an empty table is a state, a malformed body is a fault, and a
 * screen that showed "no order yet" for a broken server would have a guest
 * ordering their dinner twice.
 *
 * `now` is a parameter rather than a call to `Date.now()` so a test can assert
 * an exact clock instead of "about right" — the same rule `crew/live.ts` states.
 */
export function tableOrderFrom(
  payload: TableOrderPayload | null | undefined,
  locale: keyof Translated,
  etaMinutes: number,
  now: Date,
): TableOrder | null {
  if (payload == null || typeof payload.number !== 'string') return null;

  const lines: TableLine[] = (payload.lines ?? [])
    // A voided line stays on the bill for the audit trail and has no business
    // on a guest's screen: it is food nobody is cooking and nobody is charged
    // for.
    .filter((line) => line.status !== 'cancelled')
    .map((line) => ({
      id: String(line.id),
      name: nameOf(line, locale),
      quantity: Number(line.quantity) || 0,
      price: Number(line.unit_price) || 0,
      step: LINE_STEP[line.status ?? 'pending'] ?? 'sent',
      /*
       * The options and the kitchen note, which the endpoint sends and this
       * mapper used to throw away. A bill a guest cannot check their own
       * request against is a bill they have to take on trust.
       */
      options: (line.modifiers ?? [])
        .map((modifier) =>
          typeof modifier.name === 'string'
            ? modifier.name
            : modifier.name == null
              ? ''
              : (modifier.name[locale] ?? modifier.name.uz ?? ''),
        )
        .filter((name) => name !== ''),
      note: (line.note ?? '').trim(),
    }));

  const readyAt = new Date(now.getTime() + Math.max(0, etaMinutes) * 60_000);

  return {
    number: payload.number,
    table: payload.table?.label ?? '—',
    guests: Number(payload.guests_count ?? 0) || 0,
    /*
     * Empty rather than a name.
     *
     * The endpoint does not publish which waiter has the table, and it should
     * not: a guest at a QR code is a stranger until somebody serves them, and
     * naming a member of staff to anybody who scans a sticker is a staff-safety
     * decision nobody has made. The screens that print a name fall back to their
     * own copy when this is empty.
     */
    waiter: '',
    etaMinutes: Math.max(0, etaMinutes),
    readyBy: clock(readyAt),
    reachedAt: reachedFrom(payload.status, lines, now, etaMinutes),
    lines,
  };
}

/**
 * Which rungs this table has passed, and when.
 *
 * The bill's own status is the floor: every rung up to and including it has been
 * reached. The lines can be further along than the bill — a table whose starters
 * are `served` while the bill still reads `cooking` is the normal middle of a
 * meal — so the furthest line wins where it is ahead.
 *
 * The times are the honest part and the thin part: this endpoint answers a bill,
 * not a timeline, so the only clock it can state truthfully is now, for the rung
 * the table has just reached. Earlier rungs are marked reached with no time
 * rather than with a guessed one — `Mehmon.dc.html` prints "pending" beside a
 * rung with no clock, and a made-up clock is worse than that word.
 */
function reachedFrom(
  status: string,
  lines: readonly TableLine[],
  now: Date,
  etaMinutes: number,
): TableOrder['reachedAt'] {
  const ladder: readonly TableStep[] = ['sent', 'accepted', 'cooking', 'ready', 'served'];

  let furthest = ladder.indexOf(stepOf(status) ?? 'sent');

  for (const line of lines) {
    furthest = Math.max(furthest, ladder.indexOf(line.step));
  }

  const reached: Record<TableStep, string | null> = {
    sent: null,
    accepted: null,
    cooking: null,
    ready: null,
    served: null,
  };

  ladder.forEach((step, index) => {
    if (index > furthest) return;

    // Only the rung the table is standing on gets a clock; the ones behind it
    // are marked reached. See the note above on why nothing is invented.
    reached[step] = index === furthest ? clock(now) : '';
  });

  // A table that has not been quoted anything cannot be "ready by" anything
  // either; the caller uses `etaMinutes` for that and this keeps the two from
  // disagreeing.
  void etaMinutes;

  return reached;
}

function nameOf(line: TableOrderLinePayload, locale: keyof Translated): Translated {
  const value = line.name ?? line.title ?? '';

  if (typeof value === 'string') {
    // The API resolves jsonb `{uz,ru,en}` for the request's locale and answers a
    // plain string. Repeating it across all three keys is what lets a screen
    // read `name[locale]` without knowing which shape it got.
    return { uz: value, ru: value, en: value };
  }

  const fallback = value[locale] ?? value.uz ?? value.ru ?? value.en ?? '';

  return { uz: value.uz ?? fallback, ru: value.ru ?? fallback, en: value.en ?? fallback };
}

/** `HH:MM`, zero-padded, in the reader's own device clock. */
function clock(moment: Date): string {
  return `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;
}
