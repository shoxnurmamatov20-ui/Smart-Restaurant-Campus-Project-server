import type { MetadataRoute } from 'next';

import { DEFAULT_URL_LOCALE, URL_LOCALES, withLocale, type UrlLocale } from '@/lib/locale-path';
import { siteUrl } from '@/lib/site-url';

/**
 * The sitemap robots.ts has been promising.
 *
 * `robots.ts` names `/sitemap.xml` in every response and nothing served it, so
 * every crawl spent a request on a 404 — the same failure that file's own
 * docblock describes about the static `robots.txt` it replaced. It fixed the
 * host and not the existence. This is the other half.
 *
 * ---------------------------------------------------------------------------
 * Ten pages, and they are not all the same kind of page
 *
 * This file listed `/` alone, and its docblock explained that the marketing
 * site "is a single page with anchors, not a set of routes". That stopped being
 * true when `Smart Restaurant Cloud - Sayt v2.dc.html` was built out: the
 * design is eight `sc-if value="{{at.*}}"` blocks, six of which became real
 * routes with their own copy, their own headline and their own title and
 * canonical. A sitemap naming one of them tells a crawler the other six are not
 * worth fetching, which is the opposite of what six new pages of copy were
 * written for.
 *
 * Then it said "seven pages, because there are now seven pages" — and stayed at
 * seven while three more were built. `/download`, `/terms` and `/privacy` all
 * exist under `(marketing)`, all render real content, and all were missing
 * here, which is the same 404-shaped failure as before: not a wrong entry, an
 * absent one.
 *
 * The ten are three tiers, and the priorities say which:
 *
 *  - **`/` and `/pricing` and `/product` lead.** `/pricing` is `0.9` because it
 *    is the page a buyer searches for by name ("restoran POS narxi"), it
 *    carries the comparison table and the ROI calculator, and it answers a
 *    question a reader arrives with rather than one we would like them to have.
 *  - **`/download` is `0.8`, above the three explainer pages.** It is not
 *    marketing prose — it is where a real APK is served from, because Android
 *    installs are not going through a store. Somebody searching "srcp apk" or
 *    sent the link by an onboarding call is looking for *that file*, and a
 *    landing page they cannot find through search is a support call.
 *  - **`/terms` and `/privacy` are `0.3`, and being listed at all is the
 *    point.** Nobody arrives at a public offer from a search result, so a high
 *    priority would be a lie about how they are read. But they must be
 *    crawlable — a regulator, a corporate buyer's procurement team or an app
 *    store review looks for them by name and expects to find them without a
 *    login, which is also why `legal.test.ts` asserts `robots.ts` leaves both
 *    open. Low and present beats absent.
 *
 * **The design's eighth block is `login`, and it is deliberately not here.** The
 * rule this file has always followed is that a path belongs in the sitemap when
 * a stranger arriving from a search result would find something to read; a
 * sign-in form is not something to read, and listing it invites a crawler to
 * spend budget on a page whose only content is three empty fields. Same for
 * `/forgot-password`. That is a decision about the sitemap, not a disagreement
 * with the design — the design declares eight *screens*, not eight results.
 *
 * ---------------------------------------------------------------------------
 * Why `/r/{restaurant}` is not here, although it is the page most worth finding
 *
 * A restaurant's own website is the one surface built to be searched for, and
 * `robots.ts` allows it deliberately. It still cannot be listed: the path is
 * per tenant, so enumerating it means enumerating every restaurant on the
 * platform — publishing the customer list at a fixed URL, to anybody, forever.
 * A venue is found through its own domain and its own links, which is how a
 * restaurant is found anyway; the sitemap is not worth that trade.
 */

/**
 * The public marketing routes: the seven in the design's own navigation order,
 * then the download page, then the two legal documents the footer links to.
 */
const PAGES: readonly { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/product', priority: 0.9 },
  { path: '/roles', priority: 0.7 },
  { path: '/pricing', priority: 0.9 },
  { path: '/customers', priority: 0.7 },
  { path: '/faq', priority: 0.7 },
  { path: '/contact', priority: 0.8 },
  { path: '/download', priority: 0.8 },
  { path: '/terms', priority: 0.3 },
  { path: '/privacy', priority: 0.3 },
];

/**
 * Thirty entries, not ten — and `alternates` on every one.
 *
 * Each of the ten pages has three addresses now that the language is a path
 * segment, and a sitemap listing one of the three tells a crawler the other
 * two are not worth fetching. That is the same absent-entry failure this
 * file's own history is a list of: one page when there were seven, seven when
 * there were ten.
 *
 * `alternates.languages` is what ties the three together. Without it a crawler
 * has thirty unrelated URLs, two thirds of them near-duplicates of the first
 * ten, and it picks one per page to index — which is the position this site
 * was already in with one URL per page, arrived at from the other direction.
 * With it, it has ten pages that each exist in three languages, and it serves
 * a Russian searcher the Russian one.
 *
 * The `x-default` is Uzbek, which is what a reader whose language we do not
 * speak should land on, and the same answer the middleware gives them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const at = (path: string, locale: UrlLocale) =>
    new URL(withLocale(path, locale), base).toString();

  return PAGES.flatMap((page) =>
    URL_LOCALES.map((locale) => ({
      url: at(page.path, locale),
      changeFrequency: 'weekly' as const,
      priority: page.priority,
      alternates: {
        languages: {
          ...Object.fromEntries(URL_LOCALES.map((code) => [code, at(page.path, code)])),
          'x-default': at(page.path, DEFAULT_URL_LOCALE),
        },
      },
    })),
  );
}
