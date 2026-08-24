import { apiGet } from '@/lib/api-server';

import {
  BANNERS,
  COLUMNS,
  PLAYLIST,
  rotationSeconds,
  SCREEN_COUNT,
  soldOutCount,
  type Banner,
  type BannerKind,
  type BoardColumn,
  type BoardDish,
  type PlaylistEntry,
  type Trilingual,
} from './board-data';

/**
 * The wall above the counter, from the API.
 *
 * Server half of ./board-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import.
 *
 * Two reads rather than one, and the difference between them is the point of
 * the screen. `GET board/preview` is what the WALL draws: the configured
 * columns joined to the live catalogue, with prices from `menu.menu_items` and
 * the dimming from the kitchen's 86 sheet. `GET board/columns` is what the
 * first TAB lists — every column this venue has, including one somebody has
 * hidden, because the reorder endpoint takes the whole list and a hidden column
 * left out of it would have the write refused.
 *
 * ---------------------------------------------------------------------------
 * Prices and sold-out are not this module's, and are not asked for separately
 *
 * The board module stores neither. Both arrive already joined in the preview
 * payload, because the server does that join through `MenuCatalog::board()` and
 * `StopList::stoppedItemIds()` — a console that fetched the menu itself and
 * joined it here would be a second copy of the arithmetic, and the two copies
 * would disagree on the day one of them was changed.
 *
 * ---------------------------------------------------------------------------
 * A board belongs to ONE venue, and the console does not say which yet
 *
 * Every board endpoint is scoped to a branch, and the writes refuse without one
 * — a null `branch_id` on those tables reads back as EVERY venue. The API takes
 * the venue from `X-Branch`, or from the person when they are pinned to one.
 *
 * `lib/api-server.ts` sends the bearer token and nothing else, which
 * `shell-client.tsx` already writes down as the half still missing: the branch
 * switcher has to write the choice to a cookie and the shared reader has to
 * send it. Until then this screen is live for whoever the API has pinned to a
 * venue — the branch manager, who is the person who actually runs the counter —
 * and falls back to the fixtures for a head-office reader with no venue chosen.
 * That fallback is the ordinary one: `apiGet` answers `null` and the shell's
 * own banner says the render was degraded.
 */

/** `GET /api/v1/board/preview` — what the screens are showing right now. */
type ApiPreview = {
  data?: {
    branch_id: number;
    columns: readonly {
      id: number;
      menu_category_id: number;
      title: string | null;
      accent: string;
      items: readonly { id: number; title: string; price_tiyin: number; sold_out: boolean }[];
    }[];
    playlist: readonly {
      id: number;
      slug: string;
      title: string | null;
      seconds: number | null;
      window_start: string | null;
      window_end: string | null;
      is_scheduled: boolean;
    }[];
    banners: readonly {
      id: number;
      slug: string;
      title: string | null;
      kind: string;
      starts_at: string | null;
      ends_at: string | null;
      is_live: boolean;
      is_running: boolean;
    }[];
    rotation_seconds: number;
    sold_out_count: number;
    screen_count: number;
    pushed_at: string | null;
    behind_the_screens: boolean;
  };
};

/** `GET /api/v1/board/columns` — the reorderable list, hidden rows included. */
type ApiColumns = {
  data?: readonly {
    id: number;
    menu_category_id: number;
    accent: string;
    position: number;
    is_visible: boolean;
  }[];
};

/**
 * Everything the screen draws, live or from the fixtures.
 *
 * `wall` and `columns` are deliberately two lists rather than one flag on a
 * shared list: the preview is a picture of a wall and the tab is a control
 * surface, and the day somebody hides a column they should still be able to
 * drag it.
 */
export type BoardView = {
  /** Whether any of this came from the API. The panels need it — see below. */
  live: boolean;
  /** Changes nobody has pushed yet. Always false on the fixtures. */
  behind: boolean;
  screens: number;
  rotation: number;
  soldOut: number;
  /** What the wall draws: visible columns, with their dishes and prices. */
  wall: readonly BoardColumn[];
  /** What the first tab lists and reorders: every column, hidden ones too. */
  columns: readonly BoardColumn[];
  playlist: readonly PlaylistEntry[];
  banners: readonly Banner[];
};

/** The fixture console, with the numbers the fixtures themselves compute. */
const DEMO: BoardView = {
  live: false,
  behind: false,
  screens: SCREEN_COUNT,
  rotation: rotationSeconds(),
  soldOut: soldOutCount(),
  wall: COLUMNS,
  columns: COLUMNS,
  playlist: PLAYLIST,
  banners: BANNERS,
};

/**
 * Three kinds, three colours.
 *
 * The board's own palette, not the console's tokens, and derived from `kind`
 * rather than stored: the API has no column for a wash and should not grow one.
 * A colour is a decision about a backlit screen four metres from a queue, and
 * that decision belongs with the thing that draws it. The values are the
 * fixtures' own, so a live row and a demo row are the same green.
 */
const CHIP: Readonly<Record<BannerKind, { wash: string; ink: string }>> = {
  offer: { wash: 'rgba(18,183,106,.22)', ink: '#5EE9B5' },
  new: { wash: 'rgba(46,116,234,.24)', ink: '#7FB0FF' },
  loyalty: { wash: 'rgba(247,144,9,.22)', ink: '#FFC46B' },
};

/** A banner with no dates at all. The fixtures' own words for the same state. */
const ALWAYS: Trilingual = { uz: 'Doimiy', ru: 'Постоянно', en: 'Always on' };

/**
 * The same string in all three languages.
 *
 * `Trilingual` is how every guest-facing value on this platform travels, and a
 * clock or a date is the one kind of value that reads identically in the three:
 * `08:00–11:00` is `08:00–11:00` in Uzbek, Russian and English. Filling the
 * three slots with one string is therefore exact rather than a shortcut — and
 * it keeps these out of the message catalogue, where a value that is not a
 * sentence has no business being.
 */
const sameEverywhere = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

const KINDS: ReadonlySet<string> = new Set(['offer', 'new', 'loyalty']);

/**
 * The whole screen, for this render.
 *
 * One function rather than four, because the preview and the tabs have to be
 * the same read. The failure it prevents is the one the preview exists to catch
 * in the first place: a console showing a picture of a wall that no longer
 * matches the list underneath it.
 */
export async function getBoard(): Promise<BoardView> {
  const [preview, columns] = await Promise.all([
    apiGet<ApiPreview>('/board/preview'),
    apiGet<ApiColumns>('/board/columns'),
  ]);

  if (!preview?.data) return DEMO;

  const board = preview.data;

  /*
   * The wall's columns, keyed by row id so the tab can borrow their titles.
   *
   * A hidden column is not in this map — it is not on the wall — which is
   * exactly what makes the tab's fallback below necessary rather than defensive.
   */
  const drawn = new Map(board.columns.map((column) => [column.id, column]));

  const wall: BoardColumn[] = board.columns.map((column) => ({
    // The row id, as the key. The fixtures use words (`uzbek`, `fast`) and the
    // live rows use numbers, which is what lets `apiId()` in the panels tell a
    // real row from a demo one without a second flag travelling beside it.
    key: String(column.id),
    title: sameEverywhere(column.title ?? '—'),
    accent: column.accent,
    items: column.items.map((item): BoardDish => ({
      name: sameEverywhere(item.title),
      price: item.price_tiyin,
      // Only when true. The fixture type has it optional, and an explicit
      // `false` on every dish would be noise in a payload the wall re-reads
      // on every push.
      ...(item.sold_out ? { soldOut: true } : {}),
    })),
  }));

  return {
    live: true,
    behind: board.behind_the_screens,
    screens: board.screen_count,
    rotation: board.rotation_seconds,
    soldOut: board.sold_out_count,
    wall,
    columns: columnsFor(columns?.data, drawn, wall),
    playlist: board.playlist.map((screen): PlaylistEntry => ({
      key: String(screen.id),
      name: sameEverywhere(screen.title ?? screen.slug),
      // A scheduled screen has no duration and takes no turn; a rotating one
      // has no window. The API answers exactly one of the two, and the
      // fixture type expresses the same either/or with optional fields.
      ...(screen.seconds !== null ? { seconds: screen.seconds } : {}),
      ...(screen.is_scheduled
        ? { window: sameEverywhere(`${screen.window_start ?? ''}–${screen.window_end ?? ''}`) }
        : {}),
      state: screen.is_scheduled ? 'scheduled' : 'on',
    })),
    banners: board.banners.map((banner): Banner => {
      const kind: BannerKind = KINDS.has(banner.kind) ? (banner.kind as BannerKind) : 'offer';

      return {
        key: String(banner.id),
        text: sameEverywhere(banner.title ?? banner.slug),
        when: windowOf(banner.starts_at, banner.ends_at),
        kind,
        /*
         * `is_running`, not `is_live`.
         *
         * They are different questions and the difference is the whole reason
         * this list is worth looking at: a banner left switched on after its
         * campaign ended still says live in the database, and the mistake the
         * preview was drawn to catch is precisely "a banner still running from
         * last month". The chip shows what is ON THE WALL.
         */
        live: banner.is_running,
        wash: CHIP[kind].wash,
        ink: CHIP[kind].ink,
      };
    }),
  };
}

/**
 * The first tab's list: every column, in board order, hidden ones included.
 *
 * Falls back to the wall itself when `GET board/columns` did not answer — a
 * console that lost one of two reads should draw the columns it does have
 * rather than an empty tab under a full preview.
 */
function columnsFor(
  rows: ApiColumns['data'],
  drawn: Map<number, { title: string | null; accent: string; items: readonly unknown[] }>,
  wall: readonly BoardColumn[],
): readonly BoardColumn[] {
  if (!rows) return wall;

  return [...rows]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((row): BoardColumn => {
      const shown = drawn.get(row.id);

      return {
        key: String(row.id),
        // A hidden column has no title on the wall, because it is not on the
        // wall. An em dash says that honestly; borrowing the section name from
        // somewhere else would draw a heading nobody standing at the counter
        // can see.
        title: sameEverywhere(shown?.title ?? '—'),
        accent: row.accent,
        items:
          wall.find((column) => column.key === String(row.id))?.items ??
          ([] as readonly BoardDish[]),
      };
    });
}

/**
 * When a banner runs, as the strip's second line.
 *
 * Dates rather than prose: `17.08 — 31.08` needs no language, and the one state
 * that does need a word — a banner with no dates at all — reuses the fixtures'
 * own three, so a live "always on" row and a demo one read identically.
 */
function windowOf(from: string | null, to: string | null): Trilingual {
  if (from === null && to === null) return ALWAYS;

  const start = shortDate(from);
  const end = shortDate(to);

  if (start !== null && end !== null) return sameEverywhere(`${start} — ${end}`);

  return sameEverywhere(start ?? `— ${end ?? ''}`);
}

/** `2026-08-17T…` → `17.08`. The year is noise on a strip that runs this month. */
function shortDate(stamp: string | null): string | null {
  if (stamp === null) return null;

  const at = new Date(stamp);

  if (Number.isNaN(at.getTime())) return null;

  return `${String(at.getDate()).padStart(2, '0')}.${String(at.getMonth() + 1).padStart(2, '0')}`;
}
