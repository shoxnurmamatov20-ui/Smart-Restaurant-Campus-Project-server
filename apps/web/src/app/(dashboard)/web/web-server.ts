import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import {
  DEMO_BOOKING_GRID,
  WEEKDAYS,
  type BookingDay,
  type BookingGrid,
  type BookingHour,
  type Weekday,
  openingHoursFrom,
  type OpeningDay,
} from './web-data';

/**
 * When this venue takes bookings, from the API.
 *
 * Server half of ./web-data.ts, split per the house rule: types and fixtures in
 * `*-data.ts`, anything that calls the server in a sibling only server
 * components import. The bookings tab IS a client island, and `@/lib/api-server`
 * reads `next/headers`, which cannot survive a client import.
 *
 * ---------------------------------------------------------------------------
 * A row is a span; the grid is hours. That translation is the whole file
 *
 * `tables.booking_windows` stores one row per (branch, weekday, span):
 * *"Fridays, 18:00 to 23:00, every thirty minutes, forty covers a slot"*. The
 * design draws hours. So every read here expands a span into the whole hours it
 * offers a sitting in, and every write next door
 * (`app/api/tables/booking-windows/route.ts`) folds hours back into spans.
 *
 * Getting the edges wrong is not a cosmetic bug and it is not one anybody sees:
 * an hour dropped off the end of an expansion is an evening the grid draws as
 * closed, and the first person to touch that row writes the mistake back as a
 * span the venue never meant. Hence ./web-server.test.ts, and hence the two
 * rules below being stated rather than assumed.
 *
 *   **The last slot STARTS before `closes_at`.** `BookingWindow::slotsOn()` is
 *   explicit about it — *"a restaurant that closes at 23:00 seats a table at
 *   22:30"* — so 18:00–23:00 lights 18 through 22, and never 23.
 *
 *   **A window that closes before it opens runs past midnight.** 18:00–01:00 is
 *   a bar's Friday, not an empty set, and the model adds a day to the closing
 *   edge for exactly that reason. Those post-midnight hours belong to the
 *   weekday the window is filed under, because that is the night they are part
 *   of and the night a host is looking at.
 */

/** `GET /api/v1/tables/booking-windows` → `data[]`, exactly as it is sent. */
export type ApiBookingWindow = {
  id: number;
  branch_id: number;
  /** ISO-8601: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** `HH:MM`, a wall clock at the venue — never re-zoned. */
  opens_at: string;
  closes_at: string;
  slot_minutes: number;
  /** Guests per slot. */
  capacity: number;
  is_active: boolean;
};

const HOURS_IN_DAY = 24;

const MINUTES_IN_DAY = HOURS_IN_DAY * 60;

/**
 * `18:30` → 1110, or null for anything that is not a wall clock.
 *
 * Null rather than zero. A string the parser could not read must not become
 * midnight — that would silently move a whole evening's window to the top of
 * the grid, which is the shape of mistake this file exists to avoid.
 */
export function minutesOf(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);

  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * The whole hours a window offers a sitting in.
 *
 * Both edges are inclusive of the hour a slot can START in, which is why the
 * closing edge is `closes - 1` rather than `closes`: a window closing at 23:00
 * has no 23:00 sitting, and one closing at 23:30 does.
 */
export function hoursOfWindow(window: ApiBookingWindow): readonly number[] {
  const opens = minutesOf(window.opens_at);
  const closes = minutesOf(window.closes_at);

  if (opens === null || closes === null) return [];

  // Past midnight. Equal counts as a wrap too: `00:00`–`00:00` is a venue that
  // takes bookings around the clock, which is what the model's own
  // `lessThanOrEqualTo` makes of it.
  const ends = closes <= opens ? closes + MINUTES_IN_DAY : closes;

  const first = Math.floor(opens / 60);
  const last = Math.floor((ends - 1) / 60);

  return Array.from({ length: Math.min(last - first + 1, HOURS_IN_DAY) }, (_, step) => {
    return (first + step) % HOURS_IN_DAY;
  });
}

/**
 * Seven rows, Monday first, from however many spans the API sent.
 *
 * Ordered by opening time and applied in that order, so a later window wins an
 * hour an earlier one also claims. That is not a rule this screen invented —
 * `BookingDiary::slotsOn()` keys its slots by the instant and says the same
 * thing, adding that overlapping windows are a data-entry mistake rather than a
 * feature. Drawing a different capacity here than the site offers would make
 * this screen a second opinion about somebody's Friday.
 *
 * An inactive window is a closed one. `BookingDiary` reads through `active()`,
 * so a row with `is_active: false` offers nothing to a guest, and a grid that
 * drew it open would be advertising an evening the site refuses.
 */
export function weekFrom(windows: readonly ApiBookingWindow[]): readonly BookingDay[] {
  const byWeekday = new Map<number, Map<number, BookingHour>>();

  const ordered = [...windows]
    .filter((window) => window.is_active)
    .sort((left, right) => (minutesOf(left.opens_at) ?? 0) - (minutesOf(right.opens_at) ?? 0));

  for (const window of ordered) {
    if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) continue;

    const day = byWeekday.get(window.weekday) ?? new Map<number, BookingHour>();

    for (const hour of hoursOfWindow(window)) {
      day.set(hour, {
        hour,
        // Clamped rather than trusted: `capacity` is unsigned in the column, and
        // a negative here would paint an open hour with the "full" tint.
        capacity: Math.max(0, Math.trunc(window.capacity)),
        slotMinutes: Math.trunc(window.slot_minutes),
      });
    }

    byWeekday.set(window.weekday, day);
  }

  return WEEKDAYS.map((weekday: Weekday): BookingDay => {
    const hours = [...(byWeekday.get(weekday)?.values() ?? [])];

    return { weekday, open: hours.sort((left, right) => left.hour - right.hour) };
  });
}

/**
 * Which venue this grid is about, when the rows can settle it.
 *
 * The console sends no `X-Branch`, so the API answers with whatever the token
 * is already narrowed to: a branch manager is pinned to one venue by
 * `ResolveBranch` and sees only theirs, while an owner reading the whole estate
 * sees every venue's windows at once.
 *
 * One distinct branch in the answer is therefore the ordinary case and is worth
 * carrying, because a write that names its venue works for the owner too.
 * Several is the estate view, and there the grid must not guess — picking one
 * would draw a mall unit's hours over a terrace's. `null` hands the decision
 * back to the API, which refuses it with `tables.branch_required` and a
 * sentence the screen can show.
 */
export function venueFrom(windows: readonly ApiBookingWindow[]): number | null {
  const branches = new Set(windows.map((window) => window.branch_id));

  return branches.size === 1 ? ([...branches][0] ?? null) : null;
}

export function gridFrom(windows: readonly ApiBookingWindow[]): BookingGrid {
  return { live: true, days: weekFrom(windows), branchId: venueFrom(windows) };
}

/**
 * The week for this render — the venue's own when there is a session.
 *
 * An empty list is a real answer and is NOT the fixture: booking windows are a
 * feature a restaurant switches on by filling them in, and `BookingDiary`
 * treats a venue with none as one that accepts anything. Drawing the design's
 * sample week over that would tell a manager they had configured a diary they
 * have not, and the first click would then delete hours nobody ever set.
 *
 * `null` — no session, an expired token, a reader without `tables.view`, an API
 * mid-restart — is the sample, and it carries `live: false` so the panel says so
 * and writes nothing.
 *
 * Unpaged, because `BookingWindowController::index` answers a plain collection:
 * seven weekdays times a sitting or two is a dozen rows, not a page of them.
 */
export async function getBookingGrid(): Promise<BookingGrid> {
  const answer = await apiGet<{ data?: ApiBookingWindow[] }>('/tables/booking-windows');

  if (!answer?.data) return DEMO_BOOKING_GRID;

  return gridFrom(answer.data);
}

/* ============================================================
   Who this site belongs to
   ============================================================ */

/** `GET /api/v1/settings/site` — the head's two facts, and the section switches. */
type ApiSiteSettings = {
  data?: {
    domain?: string | null;
    headline?: string | null;
    subheadline?: string | null;
    blurb?: string | null;
    about?: string | null;
    /**
     * Which sections the site draws, by the settings document's own keys.
     *
     * Absent when a restaurant has never opened the screen, which is not the
     * same as "all off": `config/settings.php` declares the paths and the site
     * treats a missing key as on. The mapping to the design's row keys lives on
     * the panel (`SECTION_PATHS`), because the two vocabularies are not the
     * same and forcing them to be is how a switch ends up writing nothing.
     */
    sections?: Record<string, unknown>;
  };
  meta?: { restaurant?: { name?: string; slug?: string } };
};

/**
 * The words the site already carries — `settings.site`, the same document
 * `/settings/site` edits. Null on the fixture console; a live restaurant that
 * has written nothing gets empty strings, which the copy card draws as "not
 * written" in amber rather than as the demo's sentence about Chilonzor.
 */
export type SiteCopy = { headline: string; subheadline: string; blurb: string; about: string };

/**
 * The address of this restaurant's public page, and whether it is real.
 *
 * The head used to print `SITE_DOMAIN` — the literal
 * `oshxona.smartrestaurant.uz` from the design file — beside a green dot, so
 * every restaurant was shown the demo's URL as its own. There is no per-tenant
 * domain column, and the address that genuinely resolves is the tenant's own
 * route: `/r/{slug}`, which is the only indexable surface in this repo.
 *
 * A custom domain wins when the settings document carries one, because a
 * restaurant that has pointed its own name at this platform reads that name on
 * its cards and its receipts.
 *
 * `live` is false for the fixture console, and the head then says so rather
 * than dressing a demo address in a green dot.
 */
export type SiteIdentity = {
  address: string;
  live: boolean;
  copy: SiteCopy | null;
  /** The venue's week from `branch.settings.hours`, or null for the fixture console. */
  hours: readonly OpeningDay[] | null;
  /**
   * The section keys the document has switched OFF, as `settings.site` holds
   * them — `booking`, `branches`, `about`, `reviews`.
   *
   * Off rather than on, because that is the shorter list and because a key the
   * document does not carry is a section the site draws: absent means on
   * everywhere in this document, and a console that read absence as "off" would
   * show every restaurant a website with nothing on it.
   */
  sectionsOff: readonly string[];
};

export async function getSiteIdentity(closedLabel: string): Promise<SiteIdentity> {
  const answer = await apiGet<ApiSiteSettings>('/settings/site');
  const slug = answer?.meta?.restaurant?.slug;

  if (slug === undefined || slug === '') {
    return { address: '', live: false, copy: null, hours: null, sectionsOff: [] };
  }

  const domain = answer?.data?.domain;
  const text = (value: string | null | undefined): string =>
    typeof value === 'string' ? value.trim() : '';

  const sections = answer?.data?.sections;

  return {
    address: typeof domain === 'string' && domain.trim() !== '' ? domain.trim() : `/r/${slug}`,
    live: true,
    sectionsOff:
      typeof sections === 'object' && sections !== null
        ? Object.entries(sections)
            .filter(([, on]) => on === false)
            .map(([key]) => key)
        : [],
    hours: openingHoursFrom(await getOpeningHours(), new Date(), closedLabel),
    copy: {
      headline: text(answer?.data?.headline),
      subheadline: text(answer?.data?.subheadline),
      blurb: text(answer?.data?.blurb),
      about: text(answer?.data?.about),
    },
  };
}

/* ============================================================
   Traffic

   The tab drew a whole dashboard out of `web-data.ts`: "4 820 visits this week
   +18.4%", a 6.1% conversion rate, a source breakdown and a page ranking —
   figures an owner would quote to a marketing agency, for a site that went live
   yesterday. Nothing on the platform counted a visit, so the tab was made to
   say so.

   `public.site_visits` counts them now — a daily aggregate written by the
   render of `(site)/r/{slug}` itself, first-party, with nothing personal on it.
   What it can answer is visits and pages; what it cannot is conversion and
   referrer, and both are missing for the same reason: they need the visit and
   the order to be one identified journey, which means a session id this table
   deliberately does not hold so that a marketing figure does not need a cookie
   banner to exist. The tab says that rather than inventing 6.1%.
   ============================================================ */

/** `GET /api/v1/site-visits?period=` — the series, the pages and the window. */
type ApiSiteTraffic = {
  data?: {
    series?: readonly { day: string; visits: number }[];
    pages?: readonly { path: string; visits: number }[];
  };
  meta?: { visits?: number; previous_visits?: number; from?: string; to?: string };
};

export type SiteTraffic = {
  /** One entry per day of the window, quiet days included — the shape of the week. */
  series: readonly { day: string; visits: number }[];
  pages: readonly { path: string; visits: number }[];
  visits: number;
  /** The same window, one window earlier. The console draws the difference. */
  previousVisits: number;
  live: boolean;
};

const NO_TRAFFIC: SiteTraffic = {
  series: [],
  pages: [],
  visits: 0,
  previousVisits: 0,
  live: false,
};

/**
 * The week's traffic, or `live: false` when there is no session.
 *
 * A live restaurant whose site nobody has visited answers zeroes, and that is a
 * real answer the panel draws as zeroes — the difference between "we have not
 * connected this" and "nobody came" is the whole reason this tab was locked
 * before, and it must not be blurred now that it is not.
 */
export async function getSiteTraffic(): Promise<SiteTraffic> {
  const answer = await apiGet<ApiSiteTraffic>('/site-visits?period=week');

  if (!answer?.data?.series) return NO_TRAFFIC;

  return {
    series: answer.data.series,
    pages: answer.data.pages ?? [],
    visits: answer.meta?.visits ?? 0,
    previousVisits: answer.meta?.previous_visits ?? 0,
    live: true,
  };
}

/* ============================================================
   Which dishes the website shows, and how well they are described
   ============================================================ */

/** `GET /api/v1/menu/items`, narrowed to the three things the menu tab draws. */
type ApiSiteDish = {
  id: number;
  name: Translated | string;
  price: number;
  description?: Translated | string | null;
  image_url: string | null;
  is_available: boolean;
  category: { id: number } | null;
};

/** A dish as the online-menu tab lists it. */
export type SiteDish = {
  id: number;
  name: string;
  categoryName: string;
  priceTiyin: number;
  /** Whether a guest would see a photograph of it. */
  photo: boolean;
  /** Whether there is a sentence under the name. */
  described: boolean;
  available: boolean;
};

/**
 * The menu as the website publishes it, or null when there is no session.
 *
 * The tab drew ten dishes out of the design file with invented "photo" and
 * "described" flags and an invented view count. Two of those three are real
 * columns and always were — `image_url` and `description` — which is why the
 * fix here is a read rather than a schema change; the third is gone, because
 * nothing counts a view of a dish and a number nobody measured is worse than a
 * missing column.
 *
 * Sold-out dishes come too. A dish the kitchen has 86'd is still on the
 * website's menu — that is what the stop list means — and hiding it here would
 * make the "how many are live" count disagree with what a guest sees.
 */
export async function getSiteDishes(locale: string): Promise<readonly SiteDish[] | null> {
  const [items, categories] = await Promise.all([
    apiGet<Paginated<ApiSiteDish>>('/menu/items?per_page=200'),
    apiGet<Paginated<{ id: number; name: Translated | string }>>('/menu/categories?per_page=200'),
  ]);

  if (!items?.data) return null;

  const names = new Map(
    (categories?.data ?? []).map((category) => [category.id, translate(category.name, locale)]),
  );

  return items.data.map((dish) => ({
    id: dish.id,
    name: translate(dish.name, locale),
    categoryName: dish.category ? (names.get(dish.category.id) ?? '') : '',
    priceTiyin: dish.price,
    photo: typeof dish.image_url === 'string' && dish.image_url !== '',
    /*
     * "Described" is a sentence in the reader's own language, not any sentence.
     *
     * A dish whose description exists only in English is undescribed to an
     * Uzbek visitor, and this list is the one that tells somebody what still
     * needs writing. `translate()` resolves the reader's locale with the
     * document's fallback, which is exactly what the website will render.
     */
    described: translate(dish.description ?? '', locale).trim() !== '',
    available: dish.is_available,
  }));
}

/** `GET /api/v1/branches` — the venue whose week the website shows. */
type ApiBranchSettings = {
  data?: { id: number; name: string; settings?: { hours?: Record<string, string[]> } | null }[];
};

/**
 * This restaurant's opening hours, or null when the API did not answer.
 *
 * The first venue: the website screen edits one site, and a restaurant with
 * several venues publishes the flagship's week beside each venue's own
 * address — which is what `/public/site` already does for the guest.
 */
export async function getOpeningHours(): Promise<Record<string, string[]> | null> {
  const answer = await apiGet<ApiBranchSettings>('/branches?per_page=1');
  const venue = answer?.data?.[0];

  if (venue === undefined) return null;

  const hours = venue.settings?.hours;

  return hours === undefined || hours === null ? {} : hours;
}
