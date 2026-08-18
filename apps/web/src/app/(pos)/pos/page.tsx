import { getTranslations } from 'next-intl/server';

import { fetchIdleScreen, pairedTerminal } from '@/lib/pos-session';

import './pos.css';
import { getPosBoard } from './pos-data';
import { IdleScreen } from './idle-screen';
import { PairPanel } from './pair-panel';
import { PosTerminal } from './pos-terminal';

export async function generateMetadata() {
  const t = await getTranslations('console.pos');
  return { title: t('title') };
}

/**
 * The till, on a tablet.
 *
 * Its own surface, as the design draws it: no sidebar, no status strip, a 64px
 * bar and then the work. A waiter opens this holding it in one hand, and every
 * target on it is at least 44px for that reason.
 *
 * Two steps in one component: pick a table (or start a takeaway), then the
 * three-column order screen behind it — categories, dishes, ticket. They are
 * one component rather than two routes because a waiter moves between them
 * forty times a shift and a navigation on each is a navigation that can fail
 * with a table waiting.
 *
 * The floor tiles are the same objects the Tables screen draws, down to the
 * glyph: a host and a waiter looking at the same room should see the same thing.
 */
export default async function PosPage() {
  /*
   * The till boots in three steps, and this is the first two.
   *
   * A tablet with no device token is not a till yet: it shows the pairing panel
   * and nothing else. A paired one shows the idle screen — the venue's name, a
   * clock and the room's figures — until somebody presses Kirish.
   *
   * The order matters. Reaching the order screen without pairing would mean a
   * waiter taking an order the API cannot accept, so the gate is the first
   * thing the page does rather than something the order screen recovers from.
   *
   * `idle` being null does NOT mean unpaired — it means the API could not be
   * read this render. The screen handles that itself: last figures, red link
   * light, clock still running. Only a missing cookie sends anyone back to
   * pairing.
   */
  const terminal = await pairedTerminal();

  if (terminal === null) {
    return <PairPanel />;
  }

  const idle = await fetchIdleScreen();

  return <IdleScreen initial={idle} />;
}

/**
 * The order screen, once somebody has signed in.
 *
 * Still reached through the same route for now — P3 gives the PIN screen its
 * own step between the idle screen and this one, and the board becomes a live
 * read rather than the fixtures it is today.
 */
export async function OrderSurface() {
  const board = await getPosBoard();

  return <PosTerminal menu={board.menu} tables={board.tables} />;
}
