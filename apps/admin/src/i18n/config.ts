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
 * Reading a cookie opts the caller out of static rendering. Every screen here
 * is behind a session and shows figures that change by the minute, so rendering
 * per request is what these pages need anyway.
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
