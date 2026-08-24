import type { Metadata } from 'next';

import { DEFAULT_URL_LOCALE, URL_LOCALES, withLocale } from './locale-path';
import { pathLocale } from './server-locale';

/**
 * The `<link rel="canonical">` and `hreflang` set for one page, in three
 * languages.
 *
 * What this replaces said something that is no longer true, and the reason it
 * was written down is worth keeping: "the switch in the header is client
 * state, so all three languages answer on one URL — which is honest, and means
 * there is nothing to point `hreflang` at per language." That was an accurate
 * description of a site with one URL per page, and it is exactly the thing
 * that made this platform invisible to a Russian search. One URL cannot rank
 * in three languages; a crawler indexes what it is served once, and what it
 * was served was Uzbek.
 *
 * So there are three URLs now and each one says three things:
 *
 * - **canonical: itself.** Self-referencing per language. Pointing all three
 *   at the Uzbek copy — which is what a static `canonical` would do now that
 *   the page renders at three addresses — tells Google the Russian page is a
 *   duplicate and asks it not to index the one a Russian reader wants.
 * - **`hreflang` for each language**, so a crawler that has all three knows
 *   they are the same page and which reader each is for.
 * - **`x-default` on Uzbek**, which is what a reader with no matching language
 *   should land on. The platform is Uzbek-first and the venues are in
 *   Tashkent.
 *
 * Async because the answer is per request: `pathLocale()` reads the segment
 * the middleware stripped. That is also why the pages that use it export
 * `generateMetadata` rather than a `metadata` object — a constant cannot know
 * which of its three addresses it is being read at.
 */
export async function localeAlternates(bare: string): Promise<Metadata['alternates']> {
  const locale = await pathLocale();

  return {
    canonical: withLocale(bare, locale),
    languages: {
      ...Object.fromEntries(URL_LOCALES.map((code) => [code, withLocale(bare, code)])),
      'x-default': withLocale(bare, DEFAULT_URL_LOCALE),
    },
  };
}
