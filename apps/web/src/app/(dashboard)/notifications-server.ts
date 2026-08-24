import { apiGet, type Paginated } from '@/lib/api-server';

import { NOTIFICATIONS, type Notification, type PlaceKey } from './shell-data';

/**
 * What is waiting for this person, for the bell in the top bar.
 *
 * Server half of the tray in ./shell-client.tsx, split per the house rule:
 * fixtures stay in ./shell-data.ts, anything that calls the API lives beside
 * it. A file of its own rather than a second export from ./shell-server.ts,
 * because that file's whole docblock is an argument for asking the API exactly
 * one thing on every console screen — folding a second read into it would
 * contradict the paragraph it opens with. The layout runs the two together, so
 * the cost is one round trip either way.
 *
 * `GET /api/v1/notifications` answers the caller's own unread rows and nothing
 * else: no permission, no branch header, no filter. That is deliberate on the
 * server side too — see App\Http\Controllers\NotificationController for why
 * "may I read my own notifications" is not a question a role can be refused.
 *
 * ---------------------------------------------------------------------------
 * Two sources of words, and the row wins
 *
 * Every row carries a catalogue `key` AND, when the notification that wrote it
 * said one, a title and a body already in the reader's language. The key names
 * the KIND of thing — which is what the console paints, sorts and falls back
 * to — and the sentence is what makes it worth reading: a variance is not "a
 * variance", it is minus thirty-two thousand on shift 41, and no catalogue can
 * hold this evening's figure.
 *
 * So the client prefers the row's own sentence and falls back to
 * `console.notification[key]`. A key the console has never heard of still
 * draws, because the sentence is on the row.
 */

/** One row of the tray, whether it came from the API or from the fixture. */
export type FeedItem = {
  /**
   * The API row's uuid — what mark-as-read is sent against. A fixture row
   * carries its catalogue key here instead, which is not a uuid and is exactly
   * why nothing is posted for a tray that is not live.
   */
  id: string;
  /** A `console.notification` key when the console has copy for it. */
  key: string;
  level: 'high' | 'mid' | 'low';
  /** hh:mm in the VENUE's clock, formatted by the API that knows its zone. */
  time: string;
  /** The catalogue key when the console has a word for the place. */
  placeKey: PlaceKey | null;
  /** The venue's own name, which is a proper noun and is not translated. */
  placeLabel: string | null;
  href: string;
  /** This row's own sentences, or null to fall back to the catalogue. */
  title: string | null;
  body: string | null;
};

export type NotificationFeed = {
  items: readonly FeedItem[];
  /** False when this is the design's sample tray rather than the person's own. */
  live: boolean;
};

/** What `GET /api/v1/notifications` answers, narrowed to what the tray draws. */
type ApiNotification = {
  id: string;
  key: string;
  level: string;
  time: string | null;
  place: string | null;
  branch_id: number | null;
  href: string | null;
  title: string | null;
  body: string | null;
};

const LEVELS: ReadonlySet<string> = new Set(['high', 'mid', 'low']);

/**
 * The tray for this render.
 *
 * Twenty rows, because the tray scrolls to 400px and nobody reads past that;
 * the API orders severity first so the twenty that arrive are the twenty worth
 * having. `null` from `apiGet` — no session, an expired token, an API
 * mid-restart — falls back to the design's own six, exactly like every other
 * screen in this console.
 */
export async function notificationFeed(): Promise<NotificationFeed> {
  const page = await apiGet<Paginated<ApiNotification>>('/notifications?per_page=20');

  if (!page?.data) {
    return { items: NOTIFICATIONS.map(fromFixture), live: false };
  }

  return {
    items: page.data.map(toItem),
    live: true,
  };
}

function toItem(row: ApiNotification): FeedItem {
  return {
    id: row.id,
    key: row.key,
    // A level the console has no colour for is drawn as a fact rather than
    // dropped: the row is still something somebody needs to see, and painting
    // it brand instead of red is a smaller mistake than losing it.
    level: LEVELS.has(row.level) ? (row.level as FeedItem['level']) : 'low',
    time: row.time ?? '',
    /*
     * A row with no venue belongs to the whole business, which the design
     * draws as the head office — the one `place` key that is not a branch
     * name. A row that has one carries the venue's own name, so it reads the
     * same as the switcher above it.
     */
    placeKey: row.branch_id === null ? 'head_office' : null,
    placeLabel: row.place,
    // Somewhere in this console, always. A notice that leads nowhere is one
    // that has to be re-found by hand, which is the design's own point.
    href: row.href ?? '/dashboard',
    title: row.title,
    body: row.body,
  };
}

/** The design's six sample rows, in the shape the tray now reads. */
function fromFixture(item: Notification): FeedItem {
  return {
    id: item.key,
    key: item.key,
    level: item.level,
    time: item.time,
    placeKey: item.place,
    placeLabel: null,
    href: item.href,
    // Nothing to prefer: the fixture's words ARE the catalogue's.
    title: null,
    body: null,
  };
}
