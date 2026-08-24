/**
 * The language lives in the URL — `/uz/pricing`, `/ru/pricing`, `/en/pricing`.
 *
 * It used to live in four places at once, and that was the bug behind the
 * request that produced this file. A console reader's choice was a cookie
 * (`restaurant-campus-locale`), the marketing site's was a *different* cookie
 * (`srcp.site.lang`), the guest and venue screens read `?lang=`, and
 * `<html lang>` was decided by a fifth rule in the middleware. Four sources
 * cannot agree, and they didn't: a reader who picked Russian on the marketing
 * site got Uzbek back on the restaurant page they clicked through to.
 *
 * A path segment fixes more than the disagreement. It is the only form of the
 * choice that can be linked to, shared, bookmarked, and — the reason it was
 * asked for — indexed once per language instead of once per site.
 *
 * These are pure string functions on purpose. The middleware runs on the edge
 * where `@/i18n`'s message catalogues must not be pulled in, and the browser
 * needs the same arithmetic to build the link a switcher points at; anything
 * with a dependency belongs on one side or the other, not here.
 */
/*
 * Written out rather than imported, and that is a deliberate duplicate.
 *
 * The obvious import is `SUPPORTED_LOCALES` from `@restaurant/i18n` — but that
 * module's first three lines are `import uz from '../messages/uz.json'` and
 * its two siblings, so asking it for a three-item array of two-letter codes
 * drags every string the platform speaks onto the edge, on every request, to
 * decide whether a path starts with "ru".
 *
 * So the list lives here and `locale-path.test.ts` pins it to the shared one.
 * A fourth language added to the package fails that test until it is added
 * here too, which is the only thing the import was buying.
 */
export const URL_LOCALES = ['uz', 'ru', 'en'] as const;

export type UrlLocale = (typeof URL_LOCALES)[number];

export const DEFAULT_URL_LOCALE: UrlLocale = 'uz';

function isUrlLocale(value: string): value is UrlLocale {
  return (URL_LOCALES as readonly string[]).includes(value);
}

/**
 * Paths that never carry a language, and why each one would break if it did.
 *
 * `/api/*` is a contract with a client, not a page a person reads. Anything
 * with a dot in its last segment is a file — `sw.js`, `manifest.json`,
 * `/r/osh-xona/sitemap.xml` — and a file at a moved URL is a 404. The four
 * names are Next's own metadata routes, which it serves without an extension
 * and links to by absolute path from the `<head>` it generates; prefixing them
 * turns every share card on the site into a broken image.
 */
const METADATA_ROUTES = new Set(['opengraph-image', 'twitter-image', 'icon', 'apple-icon']);

export function skipsLocale(pathname: string): boolean {
  if (pathname === '/api' || pathname.startsWith('/api/')) return true;

  const segments = pathname.split('/').filter(Boolean);
  const last = segments.at(-1);

  if (last === undefined) return false;
  if (last.includes('.')) return true;

  return segments.some((segment) => METADATA_ROUTES.has(segment));
}

/**
 * Take the language off the front, if one is there.
 *
 * `bare` is what every guard in the middleware compares against, and it is
 * always a path the app itself has a route for: `/uz/dashboard` and
 * `/dashboard` both come back as `/dashboard`, so the five prefix checks that
 * decide who may see what did not have to learn about languages at all.
 */
export function splitLocale(pathname: string): { locale: UrlLocale | null; bare: string } {
  const [first, ...rest] = pathname.split('/').filter(Boolean);

  if (first === undefined || !isUrlLocale(first)) return { locale: null, bare: pathname };

  return { locale: first, bare: `/${rest.join('/')}` };
}

/** Put a language back on the front. `/` becomes `/uz`, never `/uz/`. */
export function withLocale(pathname: string, locale: UrlLocale): string {
  const bare = pathname === '/' ? '' : pathname;

  return `/${locale}${bare}`;
}

/**
 * The language a request should get when its URL does not say.
 *
 * Order is deliberate. A cookie is a choice this reader made here before, and
 * beats a header they never set. `Accept-Language` is the browser speaking for
 * them, which is better than nothing. Uzbek is last because the platform is
 * Uzbek-first and a reader who expressed no preference is likelier to read it
 * than English.
 */
export function preferredLocale(
  cookieValue: string | undefined,
  acceptLanguage: string,
): UrlLocale {
  if (cookieValue !== undefined && isUrlLocale(cookieValue)) return cookieValue;

  const first = (acceptLanguage.split(',')[0] ?? '').slice(0, 2).toLowerCase();

  return isUrlLocale(first) ? first : DEFAULT_URL_LOCALE;
}
