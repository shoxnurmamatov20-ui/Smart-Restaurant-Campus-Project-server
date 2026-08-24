import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site-url';
import { URL_LOCALES, withLocale } from '@/lib/locale-path';
import { MODULE_PATHS, SURFACE_PATHS } from '@/lib/roles';

/**
 * What a crawler may fetch.
 *
 * This replaces public/robots.txt, which was wrong in two ways that only ever
 * show up in a search console:
 *
 *  - It advertised a sitemap at `restaurant-campus.uz/sitemap.xml`. Nothing has
 *    ever served that path, so every crawl spent a request on a 404, and it
 *    named a host this deployment does not answer on anyway.
 *
 *  - It disallowed `/api/`, `/admin/` and `/_next/` and nothing else, which left
 *    every back-office screen open. Those screens answer 200 to an anonymous
 *    request by design — middleware.ts sorts roles, it does not authenticate,
 *    and the API is what defends the data — so a crawler was free to index the
 *    till, the kitchen board and the ledger, each rendered with placeholder
 *    figures. Thin duplicate pages under a restaurant's own domain, and a map
 *    of the application handed to anyone reading the index.
 *
 * Generated rather than static, for the two reasons the static file failed: the
 * host comes from SITE_URL, so it is right on every deployment, and the guarded
 * paths come from the same maps middleware reads, so a screen added later cannot
 * be guarded in one place and advertised in the other.
 */
/**
 * Every rule below, once bare and once per language.
 *
 * `Disallow` is a prefix match on the path as written, and the path as written
 * now begins with a language: `Disallow: /dashboard` does not cover
 * `/uz/dashboard`, which is the only address that page has. Left alone, this
 * file would have gone on saying the console was closed while every screen in
 * it — named branches, named staff, the ledger, the till — sat open to a
 * crawler at three URLs each.
 *
 * The bare form stays because the middleware still answers it, with a 308 to
 * the prefixed one, and a crawler should be told not to follow it rather than
 * be redirected into a page it is then told to leave.
 *
 * A wildcard (`/*​/dashboard`) would be shorter and is not worth it: it is an
 * extension the major crawlers support and the spec does not, and this file's
 * whole job is being believed by whoever reads it.
 */
const NEVER_PREFIXED: readonly string[] = ['/api/', '/_next/', '/admin/'];

function withEveryLanguage(path: string): string[] {
  // Three of these never get a language and saying `/uz/api/` would be noise
  // in a file whose only value is being read literally: `/api/` and `/_next/`
  // are cut out of the middleware's matcher, and `/admin/` is a different
  // application on the same host.
  if (NEVER_PREFIXED.includes(path)) return [path];

  return [path, ...URL_LOCALES.map((locale) => withLocale(path, locale))];
}

export default function robots(): MetadataRoute.Robots {
  // First segment only. Disallow is a prefix match, so `/finance` already
  // covers `/finance/till`, and listing both says the same thing twice.
  const guarded = [
    ...new Set(
      [...Object.values(MODULE_PATHS), ...Object.values(SURFACE_PATHS)].map(
        (path) => `/${path.split('/')[1]}`,
      ),
    ),
  ].sort();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/_next/',
        // The component gallery. Real pages, no reader.
        '/design',
        /*
         * The two guest surfaces. Not back-office screens and not secret — a
         * guest reaches them with no session at all — but not content either:
         * `/customer` is one person's basket, addresses and order history, and
         * `/qr` is one table in one restaurant. Indexed, they would publish a
         * profile page under the restaurant's own domain and spend crawl budget
         * on a landing page that means nothing to a reader who did not scan the
         * code on the table.
         */
        '/customer',
        '/qr',
        /*
         * The Telegram mini app. Same reasoning again, and one more: these URLs
         * only mean anything inside a Telegram client that has passed an
         * `initData` signature, so a crawler reaching one indexes an empty
         * basket under the restaurant's own domain.
         */
        '/tg',
        /*
         * The marketplace and its merchant panel. Temporary rather than
         * principled — a consumer marketplace is the one surface here that
         * *should* be crawled — but it stays out until there is a backend, so
         * a crawler cannot index prices no restaurant agreed to.
         */
        '/mp',
        '/merchant',
        ...guarded,
      ].flatMap(withEveryLanguage),
    },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
