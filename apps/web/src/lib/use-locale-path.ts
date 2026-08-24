'use client';

import { usePathname } from 'next/navigation';

import { DEFAULT_URL_LOCALE, splitLocale, withLocale, type UrlLocale } from './locale-path';

/**
 * The path a reader is on, in the two forms a navigation needs.
 *
 * `usePathname()` returns what the address bar says — `/uz/mp/cart` — because
 * the language is a real segment of a real URL, and the middleware's rewrite
 * onto the unprefixed route happens on the server where the browser cannot see
 * it. Every dock, rail and header in this app was written before that was true
 * and compares the whole thing against a bare route:
 *
 *     pathname.startsWith('/mp')          // false on /uz/mp
 *     pathname === '/customer'            // false on /uz/customer
 *
 * The failure is silent, which is why this exists rather than a note in a
 * review. Nothing throws; the row simply never lights up, `aria-current`
 * disappears from the whole app, and on a phone the icon rail stops telling
 * anyone where they are. Measured on `/uz/mp` before this: zero elements
 * carried `data-active`, on a screen whose entire navigation is that attribute.
 *
 * `here` is the path with the language taken off — compare against that.
 * `to()` puts it back — build hrefs with that, so following a link keeps the
 * reader in the language they are reading rather than bouncing through the
 * middleware into whatever they last chose.
 */
export function useLocalePath(): {
  here: string;
  locale: UrlLocale;
  to: (path: string) => string;
} {
  const pathname = usePathname();
  const { locale, bare } = splitLocale(pathname);
  const current = locale ?? DEFAULT_URL_LOCALE;

  return { here: bare, locale: current, to: (path: string) => withLocale(path, current) };
}
