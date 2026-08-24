import { type NextRequest } from 'next/server';

import { badRequest, forward } from '@/lib/api-proxy';

/**
 * An accountant's spreadsheet on its way to the API.
 *
 * `POST /api/v1/menu/import`, multipart, one CSV. Proxied for the reason
 * everything in this console is proxied: the session token is an httpOnly
 * cookie the browser cannot read, so the import panel cannot post to Laravel
 * itself — and the manager's own token goes up, so the API decides
 * `menu.create` against the person who actually pressed the button.
 *
 * A route handler of its own rather than `console-post.ts`, because that one
 * sends JSON and this sends a file. It is the same shape as the dish
 * photograph's handler next door, and for the same reason.
 *
 * ---------------------------------------------------------------------------
 * The body is rebuilt rather than streamed
 *
 * The photograph handler streams its file through untouched; this one does not,
 * and the difference is that this endpoint carries three fields beside the
 * file. Reading them here means a browser cannot post `dry_run` in some shape
 * the API reads as false — the three are whitelisted and re-encoded, and
 * anything else the form carried is dropped.
 *
 * ---------------------------------------------------------------------------
 * `dry_run` defaults to true on BOTH sides
 *
 * The API's default is the rehearsal and this handler does not weaken it: an
 * absent field is forwarded absent. Writing is only ever the explicit string
 * "false", spelled that way by the panel's own Apply button. A proxy that
 * "helpfully" defaulted the other way would turn a lost checkbox into two
 * hundred rewritten prices.
 */
export async function POST(request: NextRequest) {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return badRequest('invalid_body');
  }

  const file = form.get('file');

  if (!(file instanceof File)) {
    return badRequest('no_file');
  }

  const upstream = new FormData();
  upstream.append('file', file, file.name);

  // A JSON object in one field: `FormData` cannot carry a nested object, and
  // building `mapping[Наименование]=name` would mean escaping a header an
  // accountant typed into a form key. The API decodes it in
  // `ImportMenuRequest::prepareForValidation()`.
  const mapping = form.get('mapping');

  if (typeof mapping === 'string' && mapping !== '') {
    upstream.append('mapping', mapping);
  }

  // Only the one word that means "write". Anything else — absent, "1", "yes",
  // a typo — leaves the API on its own default, which is the rehearsal.
  if (form.get('dry_run') === 'false') {
    upstream.append('dry_run', 'false');
  }

  const locale = form.get('locale');

  if (locale === 'uz' || locale === 'ru' || locale === 'en') {
    upstream.append('locale', locale);
  }

  /*
   * No `Content-Type` header here on purpose: fetch derives it from the
   * FormData and appends the multipart boundary. Setting it by hand produces a
   * boundary-less header and an upstream that reads zero fields.
   */
  return forward(request, '/menu/import', { method: 'POST', body: upstream });
}
