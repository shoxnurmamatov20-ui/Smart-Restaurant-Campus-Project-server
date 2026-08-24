import { describe, expect, it } from 'vitest';

import { URL_LOCALES } from '@/lib/locale-path';

import { pageMeta, type PageKey } from './page-meta';

const PAGES: readonly PageKey[] = [
  'home',
  'product',
  'roles',
  'pricing',
  'customers',
  'faq',
  'contact',
  'download',
  'terms',
  'privacy',
];

describe('every public page names itself in every language', () => {
  it('has a title and a description for all thirty', () => {
    for (const locale of URL_LOCALES) {
      for (const page of PAGES) {
        const meta = pageMeta(locale, page);

        expect(meta?.title, `${locale}/${page} title`).toBeTruthy();
        expect(meta?.description, `${locale}/${page} description`).toBeTruthy();
      }
    }
  });

  it('never serves one language’s words under another language’s URL', () => {
    /*
     * The defect this file was written to close, and it is one a screenshot
     * shows and a type checker cannot: `/ru/pricing` rendered Russian and was
     * titled "Narxlar — ochiq narx, yashirin to’lovsiz". Three indexable URLs
     * per page, one title between them, so a Russian search result showed
     * Uzbek words above a Russian page.
     *
     * Comparing the three against each other is the only check that catches
     * it. A missing translation does not throw — it silently falls back to
     * whatever was copied in first, which is exactly how it happened.
     */
    for (const page of PAGES) {
      const titles = URL_LOCALES.map((locale) => pageMeta(locale, page).title);
      const descriptions = URL_LOCALES.map((locale) => pageMeta(locale, page).description);

      expect(new Set(titles).size, `${page}: two languages share a title`).toBe(titles.length);
      expect(new Set(descriptions).size, `${page}: two languages share a description`).toBe(
        descriptions.length,
      );
    }
  });

  it('writes the Russian in Cyrillic and the English without it', () => {
    // A cheap shape check that a "translation" is not the Uzbek pasted over.
    // The brand name is Latin in all three, so the test asks whether Cyrillic
    // appears at all rather than whether everything is.
    for (const page of PAGES) {
      expect(pageMeta('ru', page).title, `${page} ru title`).toMatch(/[А-Яа-яЁё]/);
      expect(pageMeta('ru', page).description, `${page} ru description`).toMatch(/[А-Яа-яЁё]/);
      expect(pageMeta('en', page).title, `${page} en title`).not.toMatch(/[А-Яа-яЁё]/);
      expect(pageMeta('en', page).description, `${page} en description`).not.toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('keeps titles inside what a search result shows', () => {
    // Google renders roughly 60 characters of a title and 160 of a
    // description. Longer is not an error — it is a sentence cut mid-word in
    // the one place a stranger reads about this product.
    for (const locale of URL_LOCALES) {
      for (const page of PAGES) {
        const meta = pageMeta(locale, page);

        expect(
          meta.title.length,
          `${locale}/${page} title is ${meta.title.length}`,
        ).toBeLessThanOrEqual(64);
        expect(
          meta.description.length,
          `${locale}/${page} description is ${meta.description.length}`,
        ).toBeLessThanOrEqual(230);
      }
    }
  });
});
