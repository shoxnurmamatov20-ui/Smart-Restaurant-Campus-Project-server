import { NextResponse } from 'next/server';

import { siteUrl } from '@/lib/site-url';

/**
 * One restaurant's own sitemap.
 *
 * The platform sitemap at `/sitemap.xml` deliberately lists only the marketing
 * root — enumerating `/r/{restaurant}` there would publish the customer list at
 * a fixed URL to anybody, forever. This one has no such problem: you have to
 * know the slug to ask for it, and a restaurant that hands it to Search Console
 * is handing over its own pages and nobody else's.
 *
 * Written as a route handler rather than a `sitemap.ts`, because Next's file
 * convention wants `generateSitemaps` to enumerate the dynamic segment — which
 * is the enumeration this design exists to avoid.
 *
 * ---------------------------------------------------------------------------
 * `xhtml:link` and why three languages need it here
 *
 * The same three pages answer in Uzbek, Russian and English on a query
 * parameter. Listed as three flat URLs a crawler reads them as duplicates and
 * indexes one; listed with `alternate` links it reads them as translations and
 * indexes all three. On a restaurant site in a bilingual city that is most of
 * the traffic.
 */
export const dynamic = 'force-dynamic';

const LANGS = ['uz', 'ru', 'en'] as const;

/** The three pages a stranger has any business landing on. */
const PAGES = ['', '/menu', '/book'] as const;

/**
 * XML-safe text.
 *
 * The slug arrives from the URL, so `&`, `<` and `"` all reach this document
 * unless something stops them — and a sitemap that is not well-formed XML is a
 * sitemap a crawler discards whole, silently.
 */
function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;

  if (restaurant === '' || restaurant.length > 120) {
    return new NextResponse('Not found', { status: 404 });
  }

  const base = siteUrl();
  const slug = encodeURIComponent(restaurant);

  const entries = PAGES.map((page) => {
    const url = new URL(`/r/${slug}${page}`, base).toString();

    const alternates = LANGS.map(
      (lang) =>
        `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xml(`${url}?lang=${lang}`)}" />`,
    ).join('\n');

    return [
      '  <url>',
      `    <loc>${xml(url)}</loc>`,
      alternates,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(url)}" />`,
      /*
       * The menu changes daily and the other two do not. Told apart, because a
       * crawler that believes everything changes daily wastes its budget and
       * one that believes nothing does misses today's prices.
       */
      `    <changefreq>${page === '/menu' ? 'daily' : 'weekly'}</changefreq>`,
      `    <priority>${page === '' ? '1.0' : '0.8'}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    entries,
    '</urlset>',
    '',
  ].join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // An hour. A crawler re-reads this far more often than the pages change,
      // and a restaurant that adds a dish sees it within the hour either way.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
