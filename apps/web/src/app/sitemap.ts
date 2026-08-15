import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site-url';

/**
 * The pages worth putting in front of a search engine.
 *
 * Exactly one today, and that is the honest number rather than a thin one. Of
 * the four routes that do not require a session, `/login` and `/forgot-password`
 * are forms with nothing to rank for, and `/register` is a 308 to `/#contact`,
 * which is a fragment on the page already listed here. Everything else is
 * back-office and is disallowed in robots.ts.
 *
 * Where this grows: the API already serves a guest QR menu at
 * `/api/v1/public/menu` — no login, tenant-scoped — and it has no page in this
 * app yet. That menu is the surface a diner actually searches for, one entry per
 * restaurant, and it is the reason to come back to this file.
 *
 * No `lastModified`: a build-time date changes on every deploy whether the page
 * did or not, which teaches a crawler to distrust the field. Better absent than
 * lying.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL('/', siteUrl()).toString(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
