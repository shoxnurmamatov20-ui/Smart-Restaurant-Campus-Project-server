import { apiGet } from '@/lib/api-server';

import { BRANCHES, type Branch, type CityKey } from './shell-data';

/**
 * What the top bar needs to know before any screen is opened.
 *
 * Server half of ./shell-data.ts, split per the house rule: the fixture stays
 * there, anything that calls the server is here. The layout is a server
 * component and reads this once per render; `BranchSwitcher` is handed the
 * answer rather than fetching its own, because a control in the top bar that
 * loads after the page has painted is a control that moves under the pointer.
 *
 * ---------------------------------------------------------------------------
 * One read, and the restraint is the point
 *
 * This runs on EVERY console screen, not on one — it is in the layout. So it is
 * `GET /api/v1/branches` and nothing else: a tenant-scoped, indexed select of at
 * most a hundred rows, needing no permission beyond a session, because a person
 * who cannot name their own workplace is looking at a broken screen.
 *
 * Two things it deliberately does NOT ask for:
 *
 *  - **The active venue.** `getSession()` has already read
 *    `GET /api/v1/auth/context` for the name and the role in the same render,
 *    and `branchId` is on it. Asking again would double the request on every
 *    page in the console to learn something the layout already holds.
 *  - **Today's takings per venue**, which the design draws at the right of each
 *    row. The only endpoint that answers it is `GET /api/v1/dashboard`, and that
 *    is a full sales aggregation — right to run on the dashboard, wrong to run
 *    behind the menu screen, the stock screen and every other screen a manager
 *    opens. The figure is left null and the row is drawn without it; the fixture
 *    console keeps the design's own numbers.
 *
 * Whether the switcher opens at all follows from the list rather than from a
 * flag: the API narrows a pinned user to their own venue, so one row means one
 * choice, and a control whose every option gives the same answer is worse than
 * no control.
 */
export type BranchChoice = {
  id: string;
  /**
   * What `X-Branch` is keyed on, and what the cookie holds.
   *
   * The switcher writes this rather than the id: `ResolveBranch` looks the
   * header up by `slug`, so an id would have to be translated on every read
   * and the translation needs this very list. See `lib/branch-cookie.ts`.
   */
  slug: string;
  /** A venue's name is a proper noun; it is not translated. */
  name: string;
  /** The catalogue key when the console has a word for the city. */
  cityKey: CityKey | null;
  /** What the register stores, when it has not. */
  cityLabel: string | null;
  /** `settings.seats`, a declared branch path. `null` when never configured. */
  seats: number | null;
  /**
   * Today's takings, already shortened — the switcher has no room for digits.
   *
   * Always `null` on a live render: see the note above about what asking for it
   * would cost on every screen in the console. The fixture keeps the design's
   * own figures so the demo switcher still draws the row the design draws.
   */
  revenue: string | null;
};

/** What `GET /api/v1/dashboard/pulse` answers: the strip's four facts. */
export type Pulse = {
  shift_open_since: string | null;
  floor: { occupied: number; free: number };
  kitchen: { open: number; oldest_minutes: number | null };
  stock: { low: number; out: number };
  orders_open: number;
  cases_open: number;
};

export type ShellState = {
  branches: readonly BranchChoice[];
  /**
   * The status strip's facts, or null for the fixture console — in which
   * case the strip draws the design's own sentence. Never null for a live
   * tenant: a restaurant that has nothing open reads "no service open" and
   * zeros, which is what is true.
   */
  pulse: Pulse | null;
  /**
   * Which venue the figures are about, by slug, or `null` for all of them.
   *
   * By slug rather than by id because that is what the choice is written as
   * and what the API was asked with — matching on the id would mean the row
   * highlighted in the menu and the row the reads were scoped by could differ
   * without anything noticing.
   */
  activeSlug: string | null;
  /**
   * Whether the reader may change it.
   *
   * False for somebody pinned to a venue: the server scopes them to it
   * whatever any header says, so what is drawn is a label. Offering the choice
   * anyway would be offering one the API refuses — `branch.mismatch`, on
   * every screen at once.
   */
  canSwitch: boolean;
  /** False when this is the fixture switcher rather than the restaurant's own. */
  live: boolean;
};

/** What `GET /api/v1/branches` answers, narrowed to the switcher. */
type ApiBranchRow = {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  settings?: { seats?: number } | null;
};

/** The cities the console has a word for, by what the column holds. */
const CITY_KEYS: Readonly<Record<string, CityKey>> = {
  tashkent: 'tashkent',
  toshkent: 'tashkent',
  ташкент: 'tashkent',
  termiz: 'termiz',
  termez: 'termiz',
  термез: 'termiz',
  samarkand: 'samarkand',
  samarqand: 'samarkand',
  bukhara: 'bukhara',
  buxoro: 'bukhara',
  fergana: 'fergana',
  fargona: 'fergana',
  kokand: 'kokand',
  qoqon: 'kokand',
  namangan: 'namangan',
};

/**
 * @param activeSlug The venue the session resolved to — `Session.branchSlug`,
 *   which the layout already holds. `null` is the roll-up across every venue,
 *   which is how the API reads an absent `X-Branch`.
 * @param canSwitch Whether this reader may choose another — `Session.branchPinned`
 *   inverted. A pinned person is scoped by the server whatever they pick.
 *   Defaults to false, which draws the label: a caller that only wants the
 *   venue LIST (the staff screen asks which venues it may hire into) is not
 *   drawing a switcher, and a control appearing there would write the cookie
 *   that scopes every other screen.
 */
export async function shellState(
  activeSlug: string | null,
  canSwitch = false,
): Promise<ShellState> {
  // Two reads, together: the venue list and the strip's four counts. The
  // pulse is fifteen seconds of cache on the API side, so every page a person
  // opens costs four cheap counts at most once per quarter minute.
  const [register, pulse] = await Promise.all([
    apiGet<{ data: ApiBranchRow[] }>('/branches?per_page=100'),
    apiGet<{ data: Pulse }>('/dashboard/pulse'),
  ]);

  /*
   * No answer at all — no session, or the API is restarting — is the fixture
   * console, and the design's five venues are what it is for.
   */
  if (!register?.data) {
    return {
      branches: BRANCHES.map(fromFixture),
      pulse: null,
      activeSlug: activeSlug ?? BRANCHES[0]?.id ?? null,
      canSwitch,
      live: false,
    };
  }

  /*
   * An *answer* of none is a different thing, and it must not borrow the
   * fixture: a restaurant that has opened no venue yet would be shown the demo
   * restaurant's five, with the demo's takings beside them, in its own header
   * on every screen. That happened to the first real restaurant onboarded
   * here — its owner read "Chilonzor · 6.2M" over an empty staff table.
   * Empty and live is empty: the switcher renders nothing to choose and the
   * settings screen is where a venue is added.
   */
  if (register.data.length === 0) {
    return {
      branches: [],
      pulse: pulse?.data ?? null,
      activeSlug: null,
      canSwitch,
      live: true,
    };
  }

  const branches = register.data.map((branch): BranchChoice => {
    const city = (branch.city ?? '').trim();

    return {
      id: String(branch.id),
      slug: branch.slug,
      name: branch.name,
      cityKey: CITY_KEYS[city.toLowerCase()] ?? null,
      cityLabel: city === '' ? null : city,
      seats: branch.settings?.seats ?? null,
      revenue: null,
    };
  });

  return {
    branches,
    pulse: pulse?.data ?? null,
    /*
     * Null stays null on a live console, and that is a change from what this
     * used to do.
     *
     * It fell through to the first row of the register, so a five-branch
     * restaurant with nothing chosen read "Chilonzor" over a five-branch
     * total. Nothing chosen IS a state — the roll-up — and the switcher has a
     * row for it.
     */
    activeSlug,
    canSwitch,
    live: true,
  };
}

/** The demo console's five venues, in the shape the switcher now reads. */
function fromFixture(branch: Branch): BranchChoice {
  return {
    id: branch.id,
    // The fixture's ids were always slugs — `chilonzor`, `termiz` — which is
    // why the demo switcher can be the same control as the live one.
    slug: branch.id,
    name: branch.name,
    cityKey: branch.city,
    cityLabel: null,
    seats: branch.seats,
    revenue: branch.revenue,
  };
}
