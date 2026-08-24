'use server';

import { cookies } from 'next/headers';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

import {
  CURRENCY_CODE,
  slugify,
  type BulkOutcome,
  type CrewDraft,
  type DeviceInventory,
  type PairingCode,
  type PrinterRow,
  type StepFailure,
  type StepResult,
  type TerminalRow,
} from './setup-data';

/**
 * Everything the wizard says to Laravel.
 *
 * Server actions rather than route handlers under `src/app/api`, for two
 * reasons. The token is in an httpOnly cookie the browser cannot read, so the
 * call has to originate on this side regardless; and the wizard is one route
 * group owned by one surface, so its writes belong beside it rather than in
 * the shared handler tree where the next person has to work out who calls them.
 *
 * **There is no setup endpoint on this platform.** Each step therefore posts to
 * the module endpoint it belongs to, and where no endpoint fits, the step does
 * not pretend: it collects, it validates, and the screen says what is not
 * connected. Every one of those gaps is named in a comment here and in
 * `setup-copy.ts`, so an engineer wiring it later finds the note before they
 * find the absence.
 *
 * Not wired, and what would be needed:
 *
 *   Step 1 · restaurant  — no tenant/restaurant profile endpoint exists at all.
 *                          Needs `PATCH /api/v1/restaurant` (name, tax id,
 *                          cuisine, working languages) before this step can be
 *                          anything but a local draft.
 *   Step 4 · Excel route — no import endpoint and no column-mapping screen.
 *   Step 5 · tax         — no tenant-level VAT, service-charge or payment-rail
 *                          settings. The one rounding step the API stores today
 *                          is `settings.cash_rounding_tiyin` on a terminal.
 *   Step 5 · fiscal      — nothing stores a fiscal module number and nothing
 *                          talks to soliq.uz. The design draws a working
 *                          connection test; this build refuses to fake it,
 *                          because a green tick against an untested legal
 *                          requirement is worse than a blank one.
 *   Step 6 · PINs        — `pos/auth/pin/rotate` changes the caller's own PIN.
 *                          Setting somebody else's needs a new endpoint.
 *   Step 3 · QR pack     — no endpoint renders the per-table QR PDF.
 */

/** How long a call waits before the wizard calls it a dropped connection. */
const TIMEOUT_MS = 8_000;

/** What Laravel wraps a single resource in. */
type Envelope<T> = { data: T };

type ErrorBody = {
  error?: {
    code?: string;
    message_uz?: string;
    message_ru?: string;
    message_en?: string;
    field?: string;
  };
};

const OFFLINE: StepFailure = { kind: 'offline' };
const UNAUTHORISED: StepFailure = { kind: 'unauthorised' };

/**
 * Read a refusal without inventing a sentence for it.
 *
 * The API already distinguishes "that slug is taken" from "this role may not
 * create a branch" from "you sent the same idempotency key with a different
 * body", and it writes each one in Uzbek, Russian and English. A second copy of
 * those sentences here would drift from the first within a month, and the
 * owner reading the screen would be told something slightly untrue about their
 * own tax number.
 */
async function refusalFrom(response: Response): Promise<StepFailure> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const error = body?.error;

  const uz = error?.message_uz;

  return {
    kind: 'refused',
    refusal: {
      code: error?.code ?? null,
      message:
        uz === undefined ? null : { uz, ru: error?.message_ru ?? uz, en: error?.message_en ?? uz },
      field: error?.field ?? null,
    },
  };
}

/** The console session token, or nothing. */
async function token(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * One write.
 *
 * `Idempotency-Key` is not optional and the API refuses the request without it
 * (`request.idempotency_key_missing`). It is also the reason a retry is safe:
 * the same key replays the stored response verbatim instead of creating a
 * second branch, so an owner who presses Continue twice on a slow connection —
 * or whose step failed half-way through twenty-nine table writes — gets the
 * work finished rather than doubled.
 *
 * The key is minted by the caller, once per operation, and reused across
 * retries. Generating one here would defeat the whole mechanism: every retry
 * would look like a brand-new request.
 */
async function post<T>(path: string, body: unknown, key: string): Promise<StepResult<T>> {
  const session = await token();

  if (session === undefined) return { ok: false, failure: UNAUTHORISED };

  let response: Response;

  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session}`,
        // 64 characters is the API's ceiling; a UUID plus a row suffix is well
        // inside it, and slicing keeps a long caller-supplied key from being
        // rejected for its length rather than its meaning.
        'Idempotency-Key': key.slice(0, 64),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: OFFLINE };
  }

  if (response.status === 401) return { ok: false, failure: UNAUTHORISED };
  if (!response.ok) return { ok: false, failure: await refusalFrom(response) };

  return { ok: true, value: (await response.json().catch(() => null)) as T };
}

/** One read. Returns `null` for every kind of no-answer; step 7 says so on screen. */
async function get<T>(path: string): Promise<T | null> {
  const session = await token();

  if (session === undefined) return null;

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${session}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/* ============================================================
   Step 2 — the branch
   ============================================================ */

export type BranchDraft = {
  name: string;
  city: string;
  address: string;
  phone: string;
  openAt: string;
  closeAt: string;
  businessDayStart: string;
};

/**
 * Create the first branch.
 *
 * `POST /api/v1/branches`, permission `branches.manage`.
 *
 * The slug is derived rather than asked for. It has to match `^[a-z0-9-]+$`
 * and be unique inside the restaurant, and a branch typed in Cyrillic — which
 * is most of them — produces neither. Asking an owner for a slug at step two
 * of their first hour is asking them to learn a word they will never need
 * again, so `slugify()` transliterates and the API's uniqueness check is what
 * catches the second Chilonzor.
 *
 * Opening hours and the business-day boundary go into `settings`, which is the
 * only home the branches table has for them: there are no columns for either.
 * **Nothing reads them yet.** The boundary the reports actually apply is the
 * server's own configuration, and the screen says as much rather than letting
 * an owner believe they have moved it.
 */
export async function createBranch(
  draft: BranchDraft,
  key: string,
): Promise<StepResult<{ id: number; name: string }>> {
  const result = await post<Envelope<{ id: number; name: string }>>(
    '/branches',
    {
      name: draft.name.trim(),
      slug: slugify(draft.name) || 'filial',
      city: draft.city.trim() || null,
      address: draft.address.trim() || null,
      phone: draft.phone.trim() || null,
      settings: {
        opening_hours: { open: draft.openAt, close: draft.closeAt },
        business_day_start: draft.businessDayStart,
      },
    },
    key,
  );

  if (!result.ok) return result;

  return { ok: true, value: result.value.data };
}

/* ============================================================
   Step 3 — zones and tables
   ============================================================ */

export type ZoneDraft = { name: string; prefix: string; tables: number; seats: number };

/**
 * Turn the zones into halls, then into tables.
 *
 * `POST /api/v1/tables/halls` (`tables.create`), then one
 * `POST /api/v1/tables/tables` per table (`tables.create`). There is no bulk
 * endpoint, so twenty-nine tables are twenty-nine requests — which is exactly
 * why each one carries its own derived idempotency key. A retry after a
 * half-finished run replays the writes that already landed and only performs
 * the ones that did not.
 *
 * The order matters: a table needs `hall_id`, so the hall has to exist first,
 * and a hall that fails means its tables are never attempted rather than
 * attached to somebody else's zone.
 */
export async function createFloor(zones: readonly ZoneDraft[], key: string): Promise<BulkOutcome> {
  let created = 0;

  for (const [index, zone] of zones.entries()) {
    const hall = await post<Envelope<{ id: number }>>(
      '/tables/halls',
      {
        code: (slugify(zone.name) || `zona-${index + 1}`).toUpperCase().slice(0, 32),
        name: zone.name,
        capacity: zone.tables * zone.seats,
        sort_order: index,
        is_active: true,
      },
      `${key}-h${index}`,
    );

    if (!hall.ok) return { created, failure: hall.failure };

    const hallId = hall.value.data.id;

    for (let seat = 1; seat <= zone.tables; seat += 1) {
      const table = await post<Envelope<{ id: number }>>(
        '/tables/tables',
        {
          hall_id: hallId,
          label: `${zone.prefix}${seat}`,
          seats: zone.seats,
          is_active: true,
        },
        `${key}-h${index}t${seat}`,
      );

      if (!table.ok) return { created, failure: table.failure };

      created += 1;
    }
  }

  return { created, failure: null };
}

/* ============================================================
   Step 4 — the menu
   ============================================================ */

export type CategoryDraft = {
  slug: string;
  name: { uz: string; ru: string; en: string };
  station: string;
  dishes: readonly {
    sku: string;
    name: { uz: string; ru: string; en: string };
    priceTiyin: number;
  }[];
};

/**
 * Write the menu, category by category and dish by dish.
 *
 * `POST /api/v1/menu/categories` then `POST /api/v1/menu/items`, both
 * `menu.create`.
 *
 * `price` is an integer in tiyin on both sides of this call, so nothing is
 * converted here and no float ever exists. A dish priced at 42 000 so'm
 * travels as 4 200 000 and is stored as 4 200 000; the division by a hundred
 * happens once, on a screen, at the last possible moment.
 *
 * The station rides on the item because that is what routes its ticket to a
 * printer later. A grill dish filed under the cold station is a kebab nobody
 * starts cooking, and it will not be noticed until a Friday.
 */
export async function createMenu(
  categories: readonly CategoryDraft[],
  key: string,
): Promise<BulkOutcome> {
  let created = 0;

  for (const [index, category] of categories.entries()) {
    const row = await post<Envelope<{ id: number }>>(
      '/menu/categories',
      {
        slug: category.slug,
        name: category.name,
        sort_order: index,
        is_active: true,
      },
      `${key}-c${index}`,
    );

    if (!row.ok) return { created, failure: row.failure };

    const categoryId = row.value.data.id;

    for (const [position, dish] of category.dishes.entries()) {
      const item = await post<Envelope<{ id: number }>>(
        '/menu/items',
        {
          menu_category_id: categoryId,
          sku: dish.sku,
          name: dish.name,
          price: dish.priceTiyin,
          currency: CURRENCY_CODE,
          station: category.station,
          sort_order: position,
          is_available: true,
        },
        `${key}-c${index}i${position}`,
      );

      if (!item.ok) return { created, failure: item.failure };

      created += 1;
    }
  }

  return { created, failure: null };
}

/* ============================================================
   Step 6 — people
   ============================================================ */

/**
 * Create the crew.
 *
 * `POST /api/v1/staff/members`, permission `staff.create`.
 *
 * **The PIN does not go with them, and this is the one gap on this screen that
 * changes what an owner has to do next.** The only PIN endpoint the platform
 * has is `pos/auth/pin/rotate`, which changes the PIN of whoever is calling it;
 * there is nothing that sets a PIN for somebody else. So the people are real
 * after this step and their PINs are not, and the screen says so rather than
 * showing four digits a waiter will type on Friday to no effect.
 *
 * `employee_code` is derived, because the API requires one and an owner filling
 * in their first six staff has no scheme yet. It is unique per restaurant, so a
 * second Jasur gets `-2` rather than a 422 nobody can act on.
 */
export async function createCrew(crew: readonly CrewDraft[], key: string): Promise<BulkOutcome> {
  let created = 0;
  const used = new Set<string>();

  for (const [index, person] of crew.entries()) {
    const base = (slugify(`${person.firstName}-${person.lastName}`) || `xodim-${index + 1}`)
      .toUpperCase()
      .slice(0, 26);

    let code = base;
    let attempt = 2;
    while (used.has(code)) {
      code = `${base}-${attempt}`;
      attempt += 1;
    }
    used.add(code);

    const contact = person.contact.trim();

    const row = await post<Envelope<{ id: number }>>(
      '/staff/members',
      {
        employee_code: code,
        first_name: person.firstName.trim(),
        last_name: person.lastName.trim(),
        // The column is a phone. An email belongs to the invitation flow, which
        // is not wired, so it is left off rather than stored in the wrong field.
        phone: contact.includes('@') ? null : contact || null,
        position: person.position,
        status: 'active',
      },
      `${key}-s${index}`,
    );

    if (!row.ok) return { created, failure: row.failure };

    created += 1;
  }

  return { created, failure: null };
}

/* ============================================================
   Step 7 — devices
   ============================================================ */

type Paginated<T> = { data: T[] };

/**
 * What is already registered: the tills and the printers.
 *
 * Both are reads, so neither needs a key. `live: false` means the API did not
 * answer — which the screen has to distinguish from "you have no printers",
 * because the first is a connection to fix and the second is a purchase to
 * make, and drawing them the same way sends somebody to a shop for no reason.
 */
export async function loadDevices(): Promise<DeviceInventory> {
  const [terminals, printers] = await Promise.all([
    get<Paginated<TerminalRow>>('/pos/terminals'),
    get<Paginated<PrinterRow>>('/kitchen/printers'),
  ]);

  return {
    terminals: terminals?.data ?? [],
    printers: printers?.data ?? [],
    live: terminals !== null || printers !== null,
  };
}

/**
 * A fresh eight-character code for one till.
 *
 * `POST /api/v1/pos/terminals/{terminal}/pairing-code`, permission
 * `pos.terminal`. The code is short-lived by design and the API destroys it on
 * redemption, so it is never stored on this side — it is shown, read across
 * the room into a tablet, and forgotten.
 */
export async function issuePairingCode(
  terminalId: number,
  key: string,
): Promise<StepResult<PairingCode>> {
  const result = await post<{ pairing?: { code?: string; expires_at?: string | null } }>(
    `/pos/terminals/${terminalId}/pairing-code`,
    {},
    key,
  );

  if (!result.ok) return result;

  return {
    ok: true,
    value: {
      code: result.value.pairing?.code ?? '',
      expiresAt: result.value.pairing?.expires_at ?? null,
    },
  };
}

/**
 * Send one printer a self-test.
 *
 * `POST /api/v1/kitchen/printers/{printer}/test`, permission `kitchen.manage`.
 * It answers 202: the job is queued, not printed. That distinction is the whole
 * point of the button — an owner has to walk to the grill and look, and a
 * screen claiming "printed" would stop them doing the one thing that proves it.
 */
export async function testPrinter(printerId: number, key: string): Promise<StepResult<unknown>> {
  return post(`/kitchen/printers/${printerId}/test`, {}, key);
}

/* ============================================================
   Step 8 — opening the first shift
   ============================================================ */

/**
 * Open the cash shift. This one is real, and it has consequences.
 *
 * `POST /api/v1/finance/shifts/open`, permission `finance.create`. From the
 * moment it answers, every payment the restaurant takes lands in this shift and
 * the evening's reconciliation is measured against it.
 *
 * The float is zero on purpose. `opening_cash` is in tiyin and the API also
 * accepts a note-by-note `denominations` breakdown — which is how the drawer
 * should be counted, on the till screen, by the person holding the money. A
 * figure typed here by an owner who is not standing at the drawer is a
 * variance the cashier gets blamed for at midnight.
 *
 * The API refuses a second open while one is unclosed. That refusal arrives as
 * a 422 with its own sentence and is shown as written: "there is already an
 * open shift" is exactly what somebody needs to read.
 */
export async function openFirstShift(key: string): Promise<StepResult<{ id: number }>> {
  const result = await post<Envelope<{ id: number }>>(
    '/finance/shifts/open',
    { opening_cash: 0 },
    key,
  );

  if (!result.ok) return result;

  return { ok: true, value: result.value.data };
}
