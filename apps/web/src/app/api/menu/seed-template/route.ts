import { type NextRequest } from 'next/server';

import { forward } from '@/lib/api-proxy';

/**
 * Writing a restaurant its first menu — `POST /api/v1/menu/seed-template`.
 *
 * No body, and nothing to validate. The catalogue is the server's — eight
 * sections and sixty-eight dishes it already ships as demo data — and a console
 * that could name a subset of it would be a console deciding what a restaurant
 * starts with.
 *
 * Idempotent upstream by SKIPPING rather than overwriting, which is what makes
 * this safe to forward without a confirmation step: a second press does not
 * restore a price somebody has just corrected. The answer says how many rows
 * were written and how many were already there, and the screen shows both.
 */
export async function POST(request: NextRequest) {
  return forward(request, '/menu/seed-template', { method: 'POST' });
}
