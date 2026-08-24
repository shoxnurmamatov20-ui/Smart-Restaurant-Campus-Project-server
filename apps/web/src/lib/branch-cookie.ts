/**
 * Which venue the console is reading.
 *
 * A cookie for the same reason the language is one: every screen in the console
 * renders on the server, and a choice held in `useState` would render the whole
 * business's takings on the server and then swap to one venue's after
 * hydration — the reader would watch the numbers change under them.
 *
 * ---------------------------------------------------------------------------
 * It holds the SLUG, not the id
 *
 * Because `X-Branch` takes a slug. `ResolveBranch` looks the header up by
 * `slug` within the resolved tenant; an id in this cookie would have to be
 * translated on every read, and the translation would need the branch list,
 * which is a request per screen.
 *
 * ---------------------------------------------------------------------------
 * This is a VIEW, not a permission
 *
 * Nothing downstream may treat it as proof of anything, exactly as the role
 * cookie's docblock says of itself. What a person may read is settled by the
 * API against their token: `ResolveBranch` refuses a venue that is not their
 * restaurant's (`branch.not_found`) and refuses another venue outright to
 * somebody pinned to one (`branch.mismatch`). All this cookie decides is which
 * of the venues they are already allowed to read is being asked for.
 *
 * It is written by `POST /api/dashboard/branch` rather than by
 * `document.cookie`, which is the difference from the language and role
 * cookies: that handler checks the slug against the restaurant's own register
 * and refuses to write one for a pinned reader. A cookie the browser could
 * write itself would put an unknown slug on every request in the console, and
 * every screen would answer 404 until somebody cleared their cookies.
 */
export const BRANCH_COOKIE = 'restaurant-campus-branch';

/**
 * Thirty days.
 *
 * Longer than a session, because "I look after Yunusobod" survives signing out
 * at the end of a shift. Not a year like the language, because it is a working
 * scope rather than a preference: somebody who moves venues should not be
 * reading last quarter's posting for another month.
 */
export const BRANCH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * The API's two refusals about venues.
 *
 * Read on the failure path of every console request: a cookie can outlive the
 * venue it names — a branch closed, a reader newly pinned — and the alternative
 * to noticing is a console where every screen is a 403 with no way back, on a
 * cookie the reader cannot see and did not know they had.
 */
export const BRANCH_ERROR_CODES: readonly string[] = ['branch.mismatch', 'branch.not_found'];

/** Whether an error envelope is one of those two. */
export function isBranchRefusal(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;

  const error = (body as { error?: unknown }).error;

  if (typeof error !== 'object' || error === null) return false;

  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' && BRANCH_ERROR_CODES.includes(code);
}
