import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A shelf counted, or one line corrected.
 *
 * One route for both, because they are the same act at two sizes: the store
 * screen's correction drawer is a count of exactly one row and the operations
 * tab's sheet is a count of forty. The API takes them through one endpoint for
 * the same reason — two doors would be two ways to write the same movement, and
 * the second one written would be the one that forgot the variance.
 *
 * `counted` is absolute and in base units: what the person counted, not the
 * gap. A client that sent the gap would be doing the subtraction against a
 * balance that may have moved since the sheet was printed, which is the one
 * arithmetic a count exists to avoid.
 */
type Body = {
  reference?: unknown;
  lines?: unknown;
};

type Line = { ingredientId?: unknown; counted?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || !Array.isArray(body.lines) || body.lines.length === 0) {
    return badRequest('invalid_body');
  }

  const lines: { ingredient_id: number; counted: number }[] = [];

  for (const raw of body.lines as Line[]) {
    const ingredientId = whole(raw.ingredientId);
    const counted =
      typeof raw.counted === 'number' && Number.isInteger(raw.counted) && raw.counted >= 0
        ? raw.counted
        : null;

    // A fixture row, or a field somebody left blank. Skipped rather than
    // refused: a sheet of forty must not be thrown away over one of them.
    if (ingredientId === null || counted === null) continue;

    lines.push({ ingredient_id: ingredientId, counted });
  }

  if (lines.length === 0) return badRequest('nothing_countable');

  return forward(request, '/inventory/counts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference:
        typeof body.reference === 'string' && body.reference !== '' ? body.reference : null,
      lines,
    }),
  });
}
