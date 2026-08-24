import type { Lang } from '@restaurant/surfaces/customer/data';

/**
 * Which language the customer app opens in.
 *
 * Not `next-intl`: that resolves through a request context this app never
 * establishes, and it would ship the staff console's whole catalogue to a phone.
 * The customer catalogue is its own file and this is a plain lookup over the
 * browser's own header.
 *
 * Uzbek when nothing else spoke — the restaurant is in Uzbekistan, and a customer
 * who expressed no preference is far likelier to read it than English.
 */
export function customerLang(acceptLanguage: string | null, chosen?: string | null): Lang {
  if (chosen === 'ru' || chosen === 'en' || chosen === 'uz') return chosen;

  const first = (acceptLanguage ?? '').split(',')[0]?.slice(0, 2).toLowerCase();

  return first === 'ru' || first === 'en' ? first : 'uz';
}

/**
 * The cookie the profile's language row writes.
 *
 * A cookie rather than a query parameter, because this is an app and not a
 * page: a customer who picks Russian on the profile expects the cart, the menu
 * and the tracking screen to be Russian too, and a `?lang=` would be lost by the
 * first `<Link>` that forgot to carry it. Not `httpOnly` — the control that sets
 * it is in the browser, and a language preference is not a secret.
 */
export const LANG_COOKIE = 'srcp.customer.lang';

/** Read once, in a server component: `customerLang(header, langCookie(jar))`. */
export function langCookie(jar: {
  get(name: string): { value: string } | undefined;
}): string | null {
  return jar.get(LANG_COOKIE)?.value ?? null;
}
