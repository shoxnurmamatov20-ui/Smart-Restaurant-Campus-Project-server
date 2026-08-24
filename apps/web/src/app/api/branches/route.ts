import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A venue, opened.
 *
 * `POST /api/v1/branches` exists and is gated by `branches.manage`, which by
 * the RBAC seeder is the owner's. The console's button used to say a branch is
 * created in the platform console instead; it is not, and it never was — the
 * endpoint has been in core since the foundation, alongside the branch scope
 * every module reads.
 *
 * ---------------------------------------------------------------------------
 * The slug is derived, not asked for
 *
 * `StoreBranchRequest` wants a name and a slug, and the slug is unique per
 * restaurant rather than globally — two chains may each open a venue in
 * Chilonzor and both are entitled to the name. A manager typing "Chilonzor"
 * should not also have to invent `chilonzor` and keep the two in step, so it is
 * derived here and a collision comes back as the API's own message: "Bu
 * restoranda shunday manzilli filial allaqachon bor."
 *
 * Nothing else is sent. A branch's city, address, hours and monthly target are
 * edited on the branch itself once it exists; asking for nine fields before a
 * venue has a name is a form nobody finishes.
 */
type Body = { name?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (name.length < 2 || name.length > 120) return badRequest('invalid_name');

  const slug = slugFrom(name);

  if (slug === '') return badRequest('invalid_name');

  return forward(request, '/branches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, slug }),
  });
}

/**
 * `[a-z0-9-]`, which is what the request's own pattern allows.
 *
 * Cyrillic and the Latin letters Uzbek writes with apostrophes both fall out of
 * that set, so a name written as "Mirzo Ulug'bek" reduces to `mirzo-ulug-bek`
 * rather than to nothing. A name that reduces to nothing at all is refused
 * above rather than sent as an empty slug the API would answer 422 for.
 */
function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
