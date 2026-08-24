import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A venue's monthly revenue target.
 *
 * `PATCH /api/v1/branches/{branch}` with `settings.target_monthly_tiyin`, which
 * `config/settings.php` declares in the `branch` group and nowhere else. The
 * controller MERGES the settings document rather than replacing it — the
 * console saves one panel at a time, and a whole-column write would blank the
 * opening hours the venue was created with, which nobody would notice until the
 * website said the restaurant was shut.
 *
 * ---------------------------------------------------------------------------
 * Under `settings/`, not `branches/`
 *
 * `api/branches/route.ts` opens a venue and belongs to whoever owns that
 * button. This is the branches panel of the SETTINGS screen writing one of its
 * own fields, so it lives with the screen that draws it. The upstream path is
 * the same either way.
 *
 * ---------------------------------------------------------------------------
 * Tiyin, and a ceiling
 *
 * Money is an integer in tiyin — binding convention 1 — and the stepper moves
 * in a million so'm, which is 100 000 000 of them. The upper bound mirrors the
 * schema's own `max`: a target typed with three extra zeros makes every venue
 * on the comparison table read as failing, and the honest place to refuse it is
 * before the round trip.
 */
const MAX_TIYIN = 100_000_000_000;

type Body = { branchId?: unknown; targetTiyin?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const branchId = whole(body.branchId);

  if (branchId === null) return badRequest('invalid_branch');

  /*
   * Not `whole()`, and that is the one difference worth stating: it refuses
   * zero, and zero is a legitimate target here. It means what a new venue
   * means — nobody has set one — and it is how a manager clears a target they
   * set by mistake. `attainmentPercent()` reads it and draws an empty rail
   * rather than dividing by it.
   */
  const target = body.targetTiyin;

  if (typeof target !== 'number' || !Number.isInteger(target) || target < 0) {
    return badRequest('invalid_target');
  }

  if (target > MAX_TIYIN) return badRequest('invalid_target');

  return forward(request, `/branches/${branchId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { target_monthly_tiyin: target } }),
  });
}
