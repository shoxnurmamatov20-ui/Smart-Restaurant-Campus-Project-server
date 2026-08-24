import { apiGet } from '@/lib/api-server';

import { prepCardsFrom, type ApiPrepItem, type Lang, type PrepCardRow } from './prep-data';

/**
 * The kitchen's own prep cards, from the API.
 *
 * Server half of ./prep-data.ts, split per the house rule: types and fixtures in
 * `*-data.ts`, anything that calls the server in a sibling only server
 * components import. `menu-server.ts` next door explains why the two cannot be
 * one file — `@/lib/api-server` reads `next/headers`, which cannot survive a
 * client import, and the prep tab IS a client island.
 *
 * That split is also why the mapping is not here. `prep-panels.tsx` has to map
 * one more card after every recorded batch — the API answers a production run
 * with the item it just rewrote — so `prepCardFrom()` lives in `prep-data.ts`
 * where the browser can reach it, and this file is the fetch alone.
 */

/**
 * Every card, costed by the server, or null.
 *
 * Null is the fixture console: no session, an expired token, a reader without
 * `inventory.view`, or an API mid-restart. The panel then draws
 * `fixturePrepCards()` — whose cards carry `id: null` and therefore cannot post
 * a batch, which is the one thing that must not happen against a demo row.
 *
 * Unpaged on purpose. `PrepController::index` answers a plain collection rather
 * than a page — a kitchen preps four or five things, not four hundred — so
 * there is no `?per_page=` to send and no `meta.total` to read.
 */
export async function getPrepCards(lang: Lang): Promise<readonly PrepCardRow[] | null> {
  const answer = await apiGet<{ data: ApiPrepItem[] }>('/inventory/prep');

  // `data` missing rather than empty is a shape that did not parse; an empty
  // list is a real answer and means this restaurant preps nothing yet, which
  // the panel says out loud rather than replacing with a demo kitchen.
  if (!answer?.data) return null;

  return prepCardsFrom(answer.data, lang);
}

/* ============================================================
   The shelf, for the "new prep card" form

   A card is a code, a yield and a list of components, and a component is an
   INGREDIENT ID. The panel used to have no form at all — the design's button
   flashed a hint listing the fields one would ask for and opened nothing — and
   a free-text ingredient box would have been worse than no button: a name typed
   at a field that needs a primary key is a form that cannot post.
   ============================================================ */

/** `GET /api/v1/inventory/ingredients`, narrowed to what a picker shows. */
type ApiIngredient = { id: number; name: string; unit: string };

/** A product, as the component picker needs it. */
export type ShelfItem = { id: number; name: string; unit: string };

/**
 * Everything on the shelf, or null when there is no session.
 *
 * A hundred at a time and no paging control, for the same reason the transfer
 * form's picker takes a hundred: this is a select rather than a table, and a
 * second page inside a dropdown is a worse answer than a search box.
 *
 * An empty list is a real answer — a restaurant with no ingredients recorded
 * cannot describe what its kitchen makes out of them — and the form says so
 * rather than offering an empty dropdown beside a live-looking button.
 */
export async function getShelfItems(): Promise<readonly ShelfItem[] | null> {
  const answer = await apiGet<{ data?: readonly ApiIngredient[] }>(
    '/inventory/ingredients?per_page=100&filter[is_active]=1',
  );

  if (!answer?.data) return null;

  return answer.data.map((row) => ({ id: row.id, name: row.name, unit: row.unit }));
}
