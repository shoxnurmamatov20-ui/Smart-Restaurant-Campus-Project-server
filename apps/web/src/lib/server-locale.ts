import { headers } from 'next/headers';

import { DEFAULT_URL_LOCALE, URL_LOCALES, type UrlLocale } from './locale-path';

/**
 * The language this request is being read in, on the server.
 *
 * One line, and it replaces four different answers to the same question: a
 * console cookie, a marketing cookie, `?lang=` and an `Accept-Language` guess.
 * The middleware has already taken the language off the front of the path and
 * put it here, so every server component gets the same answer as `<html lang>`
 * and as the URL in the address bar — which is the whole point of moving it
 * into the URL.
 *
 * The fallback is not defensive padding. `headers()` is available in every
 * server render this app does, but a page rendered outside the middleware's
 * matcher — the API tree, or a build-time render — has no header to read, and
 * Uzbek is the same answer the middleware would have given it.
 */
export async function pathLocale(): Promise<UrlLocale> {
  const asked = (await headers()).get('x-doc-lang');

  return (URL_LOCALES as readonly string[]).includes(asked ?? '')
    ? (asked as UrlLocale)
    : DEFAULT_URL_LOCALE;
}
