import { getTranslations } from 'next-intl/server';

import './pos.css';
import { getPosBoard } from './pos-data';
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
  const board = await getPosBoard();

  return <PosTerminal menu={board.menu} tables={board.tables} />;
}
