import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * The public website's settings, published.
 *
 * `PUT /api/v1/settings/site` writes the `site` group of `tenants.settings` —
 * which sections the site draws, what it says, the booking rules, the PWA's
 * name and colour. Two console screens reach it and both go through here:
 * `settings/site`, which is the settings page for it, and `(dashboard)/web`,
 * whose Publish button is the same write from the other end.
 *
 * ---------------------------------------------------------------------------
 * A pass-through, on purpose
 *
 * The body is the partial site document and it is forwarded unchanged. This
 * handler does not know the schema and must not learn it: `config/settings.php`
 * is the one declaration of what a site setting may be called and what shape it
 * has, `UpdateSettingsRequest` refuses every path that file does not declare,
 * and a second list here would be a second thing to keep in step — the one that
 * eventually accepts a key the API has dropped, or refuses one it has added.
 *
 * So a misspelled key comes back 422 with the API's own sentence naming the
 * path, which is exactly what the screen should show. What this file is for is
 * the thing the browser genuinely cannot do: reach the API with the person's
 * own token, which lives in an httpOnly cookie so an injected script cannot
 * read it.
 *
 * ---------------------------------------------------------------------------
 * PUT upstream, POST from the browser
 *
 * The house rule for every write in this console — one verb on this side keeps
 * `console-post.ts` to one function, and the upstream verb is a fact about the
 * API. PUT rather than PATCH because the endpoint is a document write; it still
 * merges rather than replaces, so a screen that sends three keys leaves the
 * rest of the document alone. That merge is what lets two screens own different
 * halves of one document without either erasing the other's.
 */
export async function POST(request: NextRequest) {
  const body = await jsonBody<unknown>(request);

  // An object with something in it. Anything more specific belongs upstream —
  // see above.
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('invalid_body');
  }

  if (Object.keys(body).length === 0) return badRequest('nothing_to_publish');

  return forward(request, '/settings/site', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
