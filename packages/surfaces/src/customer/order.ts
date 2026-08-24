import { DEFAULT_PORTION, type OrderState, type TrackedOrder } from './data';

/**
 * `GET /api/v1/public/orders/{number}` on the wire, and the pure function that
 * turns it into the shape the tracking screen already draws.
 *
 * Beside `customer/live.ts` rather than inside it, because the two answer
 * different endpoints and the phone imports them separately: a screen showing a
 * menu has no use for a courier, and a screen showing a delivery has no use for
 * a catalogue. The reason both are in this package is the one `pricing.ts`
 * states — the browser and the phone draw the same delivery, and two mappings
 * of one payload drift until a guest is shown two different states for one
 * dinner.
 *
 * Pure by construction: no `fetch`, no `next/*`, no DOM. `purity.test.ts`
 * enforces it, and the request belongs to the caller.
 */

export type TrackedOrderLinePayload = {
  menu_item_id?: number | string | null;
  title?: string | null;
  quantity: number;
  unit_price: number;
  total_price?: number;
  status?: string | null;
};

export type TrackedOrderPayload = {
  number: string;
  status: string;
  channel: string;
  is_open?: boolean;
  branch?: { id?: number | string | null; name?: string | null } | null;
  /** Index into `ladder`, or null for a bill that is not on it. */
  stage?: number | null;
  ladder?: readonly string[];
  /** Canonical state key → ISO 8601, for the rungs that have been reached. */
  reached_at?: Readonly<Record<string, string>>;
  payment?: { method?: string | null; state?: string | null } | null;
  eta_minutes?: number | null;
  promised_at?: string | null;
  placed_at?: string | null;
  closed_at?: string | null;
  courier?: { name?: string; vehicle?: string } | null;
  /** Where it is being carried, once it is being carried. Null for takeaway. */
  delivery?: { address?: string | null; note?: string | null } | null;
  total: number;
  lines?: readonly TrackedOrderLinePayload[];
};

export type TrackedOrderEnvelope = { data: TrackedOrderPayload };

/**
 * Which of the four rungs a delivery screen draws this order has reached.
 *
 * Four out of the canonical thirteen. `customer/data.ts` narrows the type with
 * `Extract<CanonicalOrderState, …>`, which is the compiler-linked half; this is
 * the runtime half, and `ORDER_LADDER` beside it is the order they are drawn in.
 *
 * `placed` is deliberately mapped to `accepted` and `ready` to `cooking`, and
 * that is a screen decision rather than a data one: a customer waiting on a
 * delivery is asking "is somebody dealing with it" and "is it moving", and
 * splitting those into six rungs on a phone makes a progress bar nobody reads.
 * The staff console draws all thirteen, which is where the difference matters.
 */
const STATE_OF: Readonly<Record<string, OrderState>> = {
  placed: 'accepted',
  accepted: 'accepted',
  cooking: 'cooking',
  ready: 'cooking',
  enroute: 'enroute',
  handed: 'handed',
  served: 'handed',
  topay: 'handed',
  paid: 'handed',
};

export function trackedStateOf(status: string): OrderState | null {
  return STATE_OF[status] ?? null;
}

/**
 * The order as the tracking screen holds it, or `null` when it cannot be read.
 *
 * Null covers a malformed body and a bill that has left the ladder — voided,
 * refunded, comped. Both mean "do not draw a progress bar", and the caller is
 * what knows which sentence to show: an order that was cancelled needs saying
 * so, and a server that did not answer needs a retry.
 */
export function trackedOrderFrom(
  payload: TrackedOrderPayload | null | undefined,
): TrackedOrder | null {
  if (payload == null || typeof payload.number !== 'string') return null;

  const state = trackedStateOf(payload.status);

  if (state === null) return null;

  const times: Partial<Record<OrderState, string>> = {};

  for (const [key, iso] of Object.entries(payload.reached_at ?? {})) {
    const rung = trackedStateOf(key);

    // First write wins, so `placed` sets "accepted" and a later `accepted` does
    // not overwrite it with a time the guest saw nothing happen at.
    if (rung !== null && times[rung] === undefined && iso !== '') {
      times[rung] = clock(iso);
    }
  }

  return {
    number: payload.number,
    // A slug in the fixtures and a numeric id here. The screen uses it to look
    // a branch up and falls back to the first when it cannot, which is the
    // right behaviour for both.
    branchId: String(payload.branch?.id ?? ''),
    state,
    times,
    /*
     * A wall clock, not "in 25 minutes".
     *
     * `Mijoz ilovasi.dc.html` prints `20:15`, and the reason is worth keeping:
     * a countdown re-reads as a promise being broken every minute it is open,
     * while a time is something a person plans around. The API answers both —
     * `promised_at` and `eta_minutes` — and this takes the one the design draws.
     */
    eta: payload.promised_at == null ? '' : clock(payload.promised_at),
    courier:
      payload.courier == null
        ? null
        : {
            name: payload.courier.name ?? '',
            vehicle: payload.courier.vehicle ?? '',
            initials: initialsOf(payload.courier.name ?? ''),
          },
    lines: (payload.lines ?? [])
      .filter((line) => line.status !== 'cancelled')
      .map((line) => ({
        dishId: String(line.menu_item_id ?? ''),
        /*
         * Every live line is a regular portion, and that is the truth rather
         * than a placeholder: a size is a MODIFIER on this platform — it is
         * priced into `unit_price` and frozen onto the line — so there is no
         * portion id to recover. The field stays because "repeat this order"
         * rebuilds a basket from it, and a basket needs a size.
         */
        portionId: DEFAULT_PORTION,
        quantity: Number(line.quantity) || 0,
        // The snapshot, so a dish withdrawn since is still named on the order
        // it was part of. See `TrackedOrder['lines']`.
        ...(typeof line.title === 'string' && line.title !== '' ? { title: line.title } : {}),
      })),
    // As charged, never recomputed. The bill is settled arithmetic and the
    // catalogue may have moved since.
    total: Number(payload.total) || 0,
  };
}

/** `HH:MM` in the reader's own device clock, from an ISO 8601 instant. */
function clock(iso: string): string {
  const moment = new Date(iso);

  if (Number.isNaN(moment.getTime())) return '';

  return `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;
}

/** Two letters for the courier's avatar, as the design draws it. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/* ============================================================
   Placing one — POST /api/v1/public/orders
   ============================================================ */

/** One line of a basket, in the terms the ordering endpoint accepts. */
export type PlacedLinePayload = {
  menu_item_id: number;
  quantity: number;
  modifier_choice_ids?: readonly number[];
  note?: string;
};

/** The whole request body. Nothing here is money — see `PublicOrderRequest`. */
export type PlaceOrderPayload = {
  channel: 'delivery' | 'pickup';
  branch_id?: number;
  items: readonly PlacedLinePayload[];
  customer: { name: string; phone: string };
  address?: { line: string; note?: string };
  promo_code?: string;
  payment_method: 'cash' | 'card_on_delivery' | 'online';
  source: 'web' | 'app' | 'telegram';
  /**
   * When the guest asked for it, as an ISO instant with an offset.
   *
   * Omitted for "as soon as possible", which is what most orders are.
   * `orders.scheduled_for` is nullable for exactly that reason: a null is not a
   * missing answer, it is the answer.
   *
   * The instant is resolved wherever the venue's own clock is known — the site
   * does it on the server — because `19:00` turned into a moment in a browser
   * is nineteen o'clock on the READER's clock, which for a guest abroad is a
   * different evening.
   */
  scheduled_for?: string;
  note?: string;
};

/** What a basket has to supply to become an order. */
export type PlaceOrderInput = {
  channel: 'delivery' | 'takeaway';
  branchId: string;
  /** Resolved lines, in the shape both carts already hold. */
  lines: readonly {
    dishId: string;
    modifierIds: readonly string[];
    quantity: number;
    note: string;
  }[];
  name: string;
  phone: string;
  address?: string | null;
  addressNote?: string | null;
  promoCode?: string | null;
  railId: string;
  source: 'web' | 'app' | 'telegram';
  /** The chosen sitting as an ISO instant, or null for "as soon as possible". */
  scheduledFor?: string | null;
  note?: string | null;
};

/**
 * Which of the API's three payment methods a rail id means.
 *
 * `PAYMENT_RAILS` is a screen's vocabulary — `card` is "a card at the door" and
 * `click` and `payme` are apps a guest is sent to. `orders.payment_method` has
 * three values and the difference between them is WHEN the money arrives, which
 * is what decides whether the kitchen cooks before it does.
 */
export function paymentMethodOf(railId: string): PlaceOrderPayload['payment_method'] {
  if (railId === 'cash') return 'cash';
  if (railId === 'card') return 'card_on_delivery';

  // Everything else is a rail the guest is redirected to, and an order on one
  // waits at `draft` until the provider says the money landed.
  return 'online';
}

/**
 * The request body for a basket, or `null` when this basket cannot be ordered.
 *
 * Null is the important half. A cart built against `DEMO_MENU` holds dish ids
 * like `'osh'` and modifier ids like `'extra-meat'` — words invented for a demo,
 * which exist in no restaurant's database. `POST /api/v1/public/orders` prices
 * every line through `MenuCatalog` and refuses anything it was never offered, so
 * a basket of those would be rejected in full, at the last tap, with a message
 * about a menu item id.
 *
 * Refusing to build the body is how the screen finds out BEFORE the guest
 * commits: it can say "the menu is a sample, the restaurant is not reachable"
 * on the checkout button rather than after it.
 *
 * A modifier whose id is not a number is dropped rather than sent, and only a
 * fixture has one. Dropping it would be wrong if it could happen on a live
 * menu — "no onion" lost between a phone and a pass is a plate sent back — but
 * a live sheet carries the kitchen's own numeric option ids, so anything else
 * came from the demo catalogue and is not a real instruction.
 */
export function placeOrderPayloadFrom(input: PlaceOrderInput): PlaceOrderPayload | null {
  const items: PlacedLinePayload[] = [];

  for (const line of input.lines) {
    const id = Number(line.dishId);

    if (!Number.isInteger(id) || id <= 0) return null;

    const choices = line.modifierIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    items.push({
      menu_item_id: id,
      quantity: line.quantity,
      ...(choices.length > 0 ? { modifier_choice_ids: choices } : {}),
      ...(line.note.trim() === '' ? {} : { note: line.note.trim() }),
    });
  }

  if (items.length === 0) return null;

  const branchId = Number(input.branchId);
  const delivery = input.channel === 'delivery';
  const line = (input.address ?? '').trim();

  // A delivery with nowhere to carry it is refused here rather than by a 422:
  // the address field is on the screen and the screen can point at it.
  if (delivery && line === '') return null;

  const note = (input.note ?? '').trim();
  const scheduled = (input.scheduledFor ?? '').trim();
  const addressNote = (input.addressNote ?? '').trim();
  const promo = (input.promoCode ?? '').trim();

  return {
    // The guest surfaces say `pickup` and `orders.channel` stores `takeaway`.
    // Both are accepted by the API; this sends the guest's word.
    channel: delivery ? 'delivery' : 'pickup',
    /*
     * Omitted rather than sent as a guess when the branch is a fixture slug.
     * A restaurant with one venue has no choice to make and the server picks
     * it; a chain refuses rather than guessing, which is the honest failure —
     * an order that silently landed at the wrong venue is forty minutes of
     * somebody's evening.
     */
    ...(Number.isInteger(branchId) && branchId > 0 ? { branch_id: branchId } : {}),
    items,
    customer: { name: input.name.trim(), phone: input.phone.trim() },
    ...(delivery
      ? { address: { line, ...(addressNote === '' ? {} : { note: addressNote }) } }
      : {}),
    ...(promo === '' ? {} : { promo_code: promo }),
    payment_method: paymentMethodOf(input.railId),
    source: input.source,
    ...(scheduled === '' ? {} : { scheduled_for: scheduled }),
    ...(note === '' ? {} : { note }),
  };
}
