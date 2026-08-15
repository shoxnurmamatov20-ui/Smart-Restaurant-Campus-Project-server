import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site-url';
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
        ...guarded,
      ],
    },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
