import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A restaurant answering a complaint.
 *
 * `PATCH /api/v1/marketplace/disputes/{id}` upstream. Two answers and no third:
 * `accepted` refunds the guest out of Thursday's payout, `contested` sends the
 * case to the platform, which is a person rather than a rule. `resolved` is
 * what that person writes at the end of it, and a merchant who could send it
 * would be closing their own cases.
 *
 * The API refuses a second answer on the same complaint, and that refusal is
 * passed straight through rather than smoothed over: the first answer is the
 * one the guest was already told about, and a screen that let it be overwritten
 * would be a screen where a refund can be taken back.
 *
 * An automatic credit — a delivery half an hour late, a missing item under
 * twenty thousand — arrives already settled, so the board draws no buttons on
 * it. The restaurant is being told, not asked.
 */
type Body = { state?: unknown; resolution?: unknown };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dispute: string }> },
) {
  const { dispute } = await params;

  /*
   * Checked here as well as upstream: the board draws the design's sample
   * complaints when the API cannot answer and those carry `d1`, `d2`. A tap on
   * one of those would otherwise come back as a 404 the merchant would read as
   * the platform losing their case.
   */
  if (!/^\d+$/.test(dispute)) return badRequest('invalid_dispute');

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const state = body.state === 'accepted' || body.state === 'contested' ? body.state : null;

  if (state === null) return badRequest('invalid_state');

  return forward(request, `/marketplace/disputes/${dispute}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      // Optional upstream, and the design offers no box to type one in: an
      // acceptance needs no explanation, and the evidence for a contest is
      // attached afterwards rather than in the two taps that raise it.
      resolution:
        typeof body.resolution === 'string' && body.resolution !== ''
          ? body.resolution.slice(0, 255)
          : null,
    }),
  });
}
