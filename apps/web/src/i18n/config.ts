import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { messages, type Locale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './index';

/**
 * Which language a server render speaks — and it is the one in the URL.
 *
 * This used to read `LOCALE_COOKIE`, and the docblock above it said why: there
 * was no `[locale]` route segment, so `requestLocale` was always empty and the
 * cookie was the whole answer. Both halves have changed. The language is the
 * first segment of every path now, and the middleware puts it on a
 * request-scoped header (`x-doc-lang`) after stripping it — so this reads the
 * header rather than `requestLocale`, because the segment is taken off before
 * the router ever sees the path.
 *
 * The cookie is still written, and still matters: it is what decides which
 * language an *unprefixed* URL is sent to. It is a memory of a choice, not the
 * choice itself, and nothing renders from it any more.
 *
 * Reading headers opts the caller out of static rendering, exactly as reading
 * cookies did. That is unchanged and it is the console — a page behind a
 * session showing today's takings, which renders per request regardless.
 */
export default getRequestConfig(async () => {
  const store = await headers();
  const requested = store.get('x-doc-lang');

  const locale = SUPPORTED_LOCALES.includes(requested as Locale)
    ? (requested as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: messages[locale],
  };
});
