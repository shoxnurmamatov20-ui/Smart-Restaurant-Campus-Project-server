import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { messages, type Locale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './index';
import { LOCALE_COOKIE } from './locale';

/**
 * Which language a server render speaks.
 *
 * Read from the cookie the language menu writes, falling back to Uzbek. There
 * is no `[locale]` route segment — see ./locale.ts for why — so `requestLocale`
 * is always empty and the cookie is the whole answer.
 *
 * Reading a cookie opts the caller out of static rendering. That is only the
 * console: the public site is a client component with its own provider and
 * never touches this, so `/` stays prerendered while `/dashboard` — a page
 * behind a session, showing today's takings — renders per request, which is
 * what it needs anyway.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;

  const locale = SUPPORTED_LOCALES.includes(requested as Locale)
    ? (requested as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: messages[locale],
  };
});
