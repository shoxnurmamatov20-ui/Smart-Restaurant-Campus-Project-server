import { BRANCHES, type Trilingual } from '../../../venue-data';
import { fetchOrderVenues, fetchVenue } from '../../../venue-server';

/**
 * The venues the booking form may offer, each with the number the API books by.
 *
 * Two reads joined, because neither endpoint answers the whole question and
 * both refuse to for good reasons:
 *
 *   `public/site` knows which venues take bookings at all (`bookable`) and
 *   publishes a **slug** for an id — a shop window has no business handing out
 *   primary keys, and `venue-server.ts` says so where it reads it.
 *
 *   `public/branches` knows the **row id**, which is what `branch_id` on
 *   `POST /api/v1/public/reservations` is, and knows nothing about bookings.
 *
 * They agree on the slug, so that is the seam. A venue the checkout can reach
 * but the shop window has hidden is dropped rather than offered: a table
 * requested at a venue that does not take bookings is a request nobody reads.
 *
 * `apiId` is null for a fixture render — the API did not answer — and that is
 * the useful half rather than a gap. The form can draw the chooser and cannot
 * pretend to send it, exactly as the checkout's `CartVenue` does: a restaurant
 * with more than one open venue is answered `tables.branch_required` without an
 * id, so a guess here would be a family standing in the wrong doorway.
 */
export type BookVenue = {
  /** The slug — the radio's own identity, and the join key. */
  id: string;
  /** `branches.id`. Sent as `branch_id`; never rendered. */
  apiId: number | null;
  name: string;
  address: Trilingual;
};

export async function fetchBookVenues(restaurant: string): Promise<readonly BookVenue[]> {
  const [venue, orderable] = await Promise.all([
    fetchVenue(restaurant),
    fetchOrderVenues(restaurant),
  ]);

  /* `null` is "the branch read failed", `[]` is "this restaurant published
     none" — see `fetchOrderVenues`. Either way there is no id to book against,
     and the form refuses rather than posting a number it invented. */
  const ids = new Map((orderable ?? []).map((entry) => [entry.slug, entry.apiId]));

  /*
   * The design's five when the API did not answer.
   *
   * `fetchVenue` already falls back to `BRANCHES`, so this branch is about the
   * ids rather than the names: a fixture render has none, and saying so is what
   * lets the form refuse honestly instead of posting a number it invented.
   */
  const source = venue.live ? venue.branches : BRANCHES;

  return source
    .filter((branch) => branch.bookable !== false)
    .map((branch) => ({
      id: branch.id,
      apiId: ids.get(branch.id) ?? null,
      name: branch.name,
      address: branch.address,
    }));
}
