import { getTranslations } from 'next-intl/server';

import { fetchIdleScreen, pairedTerminal, shiftToken } from '@/lib/pos-session';

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
   * One route, three states, and which one shows is decided by what this
   * tablet is holding rather than by where it navigated from.
   *
   *   no device token   → the pairing panel. Not a till yet.
   *   device, no shift  → the idle screen. A till with nobody at it.
   *   device and shift  → the work.
   *
   * Deciding it from the cookies rather than from the navigation is what makes
   * the back button, a reload and a tablet woken from sleep all land on the
   * same screen — and the last of those is the normal case, because this
   * device is left on a counter for eight hours.
   *
   * The order of the two gates matters. Reaching the work without a device
   * token would mean a waiter taking an order the API cannot accept; reaching
   * it without a shift would mean an order attributed to nobody, which is the
   * thing every void and every discount is later traced through.
   */
  const terminal = await pairedTerminal();

  if (terminal === null) {
    return <PairPanel />;
  }

  if ((await shiftToken()) === null) {
    /*
     * `idle` being null does NOT mean unpaired — it means the API could not be
     * read this render. The screen handles that itself: last figures, red link
     * light, clock still running. Only a missing cookie sends anyone back to
     * pairing.
     */
    return <IdleScreen initial={await fetchIdleScreen()} />;
  }

  /*
   * The board is still fixtures, and that is P4's work rather than an oversight
   * here: the live read needs the menu, the stop list and the floor, and the
   * first two want the realtime channel that arrives with them. What is real
   * today is everything around it — this tablet is a known terminal, and the
   * person at it signed in with a PIN against a session the API is holding.
   */
  const board = await getPosBoard();

  return <PosTerminal menu={board.menu} tables={board.tables} />;
}
