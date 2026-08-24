import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Opening or closing one hour of one weekday, against a table of spans.
 *
 * The bookings tab draws a weekday × hour grid; `tables.booking_windows` stores
 * one row per (branch, weekday, span) — *"Fridays, 18:00 to 23:00, every thirty
 * minutes, forty covers a slot"*. There is no "close 15:00" verb upstream and
 * there should not be: closing an hour inside a service is a SPLIT, closing the
 * last hour is a shortened span, and closing the only open hour is a deleted
 * row. All three are the same statement — *these are the hours we take
 * bookings in on this weekday* — so that is what the browser sends, and this
 * handler works out which rows have to change.
 *
 * The body is therefore the whole weekday, not the click: `hours` is what must
 * be OPEN when this returns. A handler that took "close 15:00" would have to
 * re-read the grid to know what the other hours were anyway, and would race
 * with the person who changed one of them.
 *
 * ---------------------------------------------------------------------------
 * Why the writes go in this order
 *
 * Rows are matched by `opens_at`, which is the natural key the table itself
 * uses — `booking_windows_one_per_start` is unique on
 * (tenant, branch, weekday, opens_at). So a wanted span whose opening time
 * already exists is a PATCH of that row, a wanted span with a new opening time
 * is a POST, and any row whose opening time is no longer wanted is a DELETE.
 * Matching this way is what makes "create first" possible at all: creating a
 * 10:00–15:00 span while a 10:00–23:00 row still stood would be refused by that
 * index, not merely overlap it.
 *
 * The deletes go last, and the trade is not symmetric. A moment where two rows
 * overlap costs nothing measurable: `BookingDiary::slotsOn()` keys its slots by
 * the instant, so overlapping windows produce ONE slot with one capacity rather
 * than two competing ones — it says so, and calls overlaps a data-entry mistake
 * rather than a doubling. A moment where neither row exists is a venue whose
 * website takes no bookings for that evening, and the guest who tried in that
 * window does not come back later to see whether it was fixed.
 *
 * ---------------------------------------------------------------------------
 * This is a sequence of calls, not a transaction, and it says so
 *
 * Three or four upstream requests on one person's token. Nothing here can roll
 * back a PATCH once a later DELETE is refused — no permission, an API that went
 * away mid-run — and pretending otherwise with a "rollback" that is itself two
 * more calls would just move the failure.
 *
 * What is true instead is that the operation is idempotent in the shape that
 * matters: the body describes the destination rather than the journey, so
 * pressing the tile again re-reads what is actually there and re-derives the
 * PATCHes, POSTs and DELETEs from that. A half-applied weekday converges on the
 * next attempt. The first refusal is returned as it came, with its own status
 * and its own three sentences, so the grid puts the tile back and the person
 * sees why rather than seeing a tile that did not move.
 */

/** `GET /api/v1/tables/booking-windows` → `data[]`. */
type ApiWindow = {
  id: number;
  branch_id: number;
  weekday: number;
  opens_at: string;
  closes_at: string;
  slot_minutes: number;
  capacity: number;
  is_active: boolean;
};

type Body = {
  /** ISO-8601: 1 = Monday … 7 = Sunday. */
  weekday?: unknown;
  /** The hours that must be open on that weekday when this returns. */
  hours?: unknown;
  /** Which venue, when the grid could tell. Omitted leaves it to `X-Branch`. */
  branchId?: unknown;
  /** Guests per slot, and the sitting length. Both keep their row's own when absent. */
  capacity?: unknown;
  slotMinutes?: unknown;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

const HOURS_IN_DAY = 24;

/** One contiguous run of open hours, as the row that will carry it. */
type Span = {
  /** `HH:00`. */
  opens: string;
  /** `HH:00`, exclusive — `00:00` for a run that ends at 23:00. */
  closes: string;
  hours: readonly number[];
};

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/** `18:00:00` and `18:00` are the same opening time; the column sends either. */
const hhmm = (value: string): string => value.slice(0, 5);

/**
 * Contiguous runs of hours, folded into the spans a venue would have typed.
 *
 * The one non-obvious case is midnight. A run that ends at 23:00 and a run that
 * begins at 00:00 are ONE window — a bar's Friday from six until one — and
 * writing them as two rows would be a real change rather than a formatting one:
 * a separate `00:00` row on Friday means slots early on Friday MORNING, which is
 * a different night from the one the grid was showing. So they are joined, and
 * the closing edge wraps: 18:00 → `01:00`.
 *
 * A week that is open around the clock lands on `00:00`–`00:00`, which the model
 * reads as a wrap for the same reason it reads 18:00–01:00 as one.
 */
export function spansOf(hours: readonly number[]): readonly Span[] {
  const sorted = [...new Set(hours)].sort((left, right) => left - right);
  const runs: number[][] = [];

  for (const hour of sorted) {
    const open = runs.at(-1);

    if (open !== undefined && hour === (open.at(-1) ?? -2) + 1) open.push(hour);
    else runs.push([hour]);
  }

  const first = runs.at(0);
  const final = runs.at(-1);

  if (runs.length > 1 && first?.at(0) === 0 && final?.at(-1) === HOURS_IN_DAY - 1) {
    runs.pop();
    runs.shift();
    runs.push([...final, ...first]);
  }

  return runs.map((run) => ({
    opens: clock(run.at(0) ?? 0),
    closes: clock(((run.at(-1) ?? 0) + 1) % HOURS_IN_DAY),
    hours: run,
  }));
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const weekday = weekdayOf(body.weekday);

  if (weekday === null) return badRequest('invalid_weekday');

  // Checked here as well as upstream, because upstream never sees these as
  // hours: they arrive there already folded into `opens_at` and `closes_at`,
  // and an hour of 26 would become the string `26:00`, which is refused as a
  // format rather than as the nonsense it is.
  const hours = hoursOf(body.hours);

  if (hours === null) return badRequest('invalid_hours');

  const asked = body.branchId === undefined || body.branchId === null ? null : whole(body.branchId);

  if (asked === null && body.branchId !== undefined && body.branchId !== null) {
    return badRequest('invalid_branch');
  }

  const capacity = boundedOr(body.capacity, 0, 2000);
  const slotMinutes = boundedOr(body.slotMinutes, 15, 240);

  if (capacity === false) return badRequest('invalid_capacity');
  if (slotMinutes === false) return badRequest('invalid_slot_minutes');

  const list = await forward(
    request,
    asked === null ? '/tables/booking-windows' : `/tables/booking-windows?branch_id=${asked}`,
    { method: 'GET' },
  );

  // `tables.view` is its own permission and this is a refusal a real reader can
  // hit. Passed back as it came rather than flattened into "could not save".
  if (!list.ok) return list;

  const all = ((await list.json()) as { data?: ApiWindow[] }).data ?? [];
  const venue = asked ?? venueOf(all);

  /*
   * An owner is not pinned to a venue, so the answer above is every venue's
   * windows at once and this handler cannot tell which one the grid was
   * showing. Rewriting a weekday across all of them would close a terrace
   * because somebody closed a mall unit, so it is refused instead — the same
   * code the API itself uses when a window arrives with no venue on it.
   */
  if (venue === null && all.length > 0) return badRequest('branch_required');

  const mine = all.filter(
    (window) => window.weekday === weekday && (venue === null || window.branch_id === venue),
  );

  const spans = spansOf(hours);
  const wanted = new Set(spans.map((span) => span.opens));

  for (const span of spans) {
    const standing = mine.find((window) => hhmm(window.opens_at) === span.opens);

    if (standing !== undefined) {
      // Already exactly this span, and nobody asked to change its numbers. A
      // write that changes nothing is a write somebody has to read in the audit
      // log later and wonder about.
      const unchanged =
        hhmm(standing.closes_at) === span.closes &&
        standing.is_active &&
        capacity === null &&
        slotMinutes === null;

      if (unchanged) continue;

      /*
       * `weekday`, `opens_at` and `closes_at` all travel on the PATCH because
       * `BookingWindowController::validated()` marks them `required` on update
       * as well as on create — a partial body is refused, not merged.
       *
       * `is_active: true` because a row switched off is a row the site ignores,
       * so re-opening an hour it covers has to switch it back on. Leaving it
       * alone would draw an open tile over an evening the chooser refuses.
       */
      const patched = await forward(request, `/tables/booking-windows/${standing.id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          weekday,
          opens_at: span.opens,
          closes_at: span.closes,
          is_active: true,
          ...(capacity === null ? {} : { capacity }),
          ...(slotMinutes === null ? {} : { slot_minutes: slotMinutes }),
        }),
      });

      if (!patched.ok) return patched;

      continue;
    }

    /*
     * A new opening time. Its capacity and sitting length are inherited from
     * whichever row was in force at that hour, because the commonest reason a
     * new span appears is that an old one was split: closing 15:00 inside
     * 10:00–23:00 leaves 16:00–23:00 as a "new" span, and giving it the
     * column's default of twenty covers would quietly halve a forty-cover
     * evening nobody meant to touch.
     */
    const inherited = coveringOf(mine, span.opens);

    const created = await forward(request, '/tables/booking-windows', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        weekday,
        opens_at: span.opens,
        closes_at: span.closes,
        is_active: true,
        // `undefined` is dropped by JSON.stringify, which is what leaves the
        // API's own defaults — thirty minutes, twenty covers — in charge on a
        // weekday that had nothing on it at all.
        capacity: capacity ?? inherited?.capacity,
        slot_minutes: slotMinutes ?? inherited?.slot_minutes,
        branch_id: venue ?? undefined,
      }),
    });

    if (!created.ok) return created;
  }

  // Last, and only now. See the docblock: an overlap is one slot, a gap is an
  // evening the website will not take.
  for (const window of mine) {
    if (wanted.has(hhmm(window.opens_at))) continue;

    const removed = await forward(request, `/tables/booking-windows/${window.id}`, {
      method: 'DELETE',
    });

    if (!removed.ok) return removed;
  }

  /*
   * What the weekday now is, from the spans that were written rather than from
   * a third round trip. Re-reading would answer a question this handler just
   * settled, through the same non-transactional window — and the grid has
   * already drawn these hours optimistically, so what it needs back is
   * confirmation, not a second opinion.
   */
  return NextResponse.json({
    data: {
      weekday,
      hours: spans.flatMap((span) => span.hours).sort((left, right) => left - right),
      branchId: venue,
    },
  });
}

// ============ Internals ============

function weekdayOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
    ? value
    : null;
}

/** Whole hours, 0–23, deduped. Null for anything that is not that. */
function hoursOf(value: unknown): readonly number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > HOURS_IN_DAY) return null;

  const hours: number[] = [];

  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry > 23) {
      return null;
    }

    hours.push(entry);
  }

  return hours;
}

/**
 * An optional whole number inside a range.
 *
 * Three outcomes rather than two: the value was absent (`null`, leave the row's
 * own), the value is usable, or the value is nonsense (`false`, refuse). A
 * two-way version would let `capacity: -4` fall through as "absent" and write
 * an evening nobody could book.
 */
function boundedOr(value: unknown, low: number, high: number): number | null | false {
  if (value === undefined || value === null) return null;

  return typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high
    ? value
    : false;
}

/** One venue in the answer, or null when it spans several. */
function venueOf(windows: readonly ApiWindow[]): number | null {
  const branches = new Set(windows.map((window) => window.branch_id));

  return branches.size === 1 ? ([...branches][0] ?? null) : null;
}

/** The row that was in force at an opening time — the latest one at or before it. */
function coveringOf(windows: readonly ApiWindow[], opens: string): ApiWindow | undefined {
  return [...windows]
    .filter((window) => hhmm(window.opens_at) <= opens)
    .sort((left, right) => hhmm(left.opens_at).localeCompare(hhmm(right.opens_at)))
    .at(-1);
}
