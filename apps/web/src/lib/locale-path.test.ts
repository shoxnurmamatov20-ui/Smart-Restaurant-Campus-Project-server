import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from '@restaurant/i18n';

import {
  DEFAULT_URL_LOCALE,
  URL_LOCALES,
  preferredLocale,
  skipsLocale,
  splitLocale,
  withLocale,
} from './locale-path';

describe('the URL language list', () => {
  it('is the list the rest of the platform speaks', () => {
    /*
     * The reason this test exists is the reason the list is written out twice.
     *
     * `@restaurant/i18n` opens by importing three message catalogues, so the
     * middleware cannot ask it for three two-letter codes without dragging
     * every string the platform speaks onto the edge on every request. So the
     * codes live in `locale-path.ts` and this pins them. A fourth language
     * added to the package fails here until the router learns it — which is
     * the only thing the import was ever buying.
     */
    expect([...URL_LOCALES]).toEqual([...SUPPORTED_LOCALES]);
  });

  it('defaults to Uzbek', () => {
    expect(DEFAULT_URL_LOCALE).toBe('uz');
  });
});

describe('taking the language off a path', () => {
  it('splits a prefixed path', () => {
    expect(splitLocale('/ru/pricing')).toEqual({ locale: 'ru', bare: '/pricing' });
    expect(splitLocale('/uz')).toEqual({ locale: 'uz', bare: '/' });
    expect(splitLocale('/en/r/osh-xona/menu')).toEqual({ locale: 'en', bare: '/r/osh-xona/menu' });
  });

  it('leaves an unprefixed path alone', () => {
    expect(splitLocale('/pricing')).toEqual({ locale: null, bare: '/pricing' });
    expect(splitLocale('/')).toEqual({ locale: null, bare: '/' });
  });

  it('does not mistake a route for a language', () => {
    // `/en` is English; `/enrol` is a crew handler, and a `startsWith` here
    // would have swallowed it whole.
    expect(splitLocale('/enrol').locale).toBeNull();
    expect(splitLocale('/ruble').locale).toBeNull();
    expect(splitLocale('/uzbekistan').locale).toBeNull();
  });
});

describe('putting the language back on', () => {
  it('never leaves a trailing slash on the root', () => {
    expect(withLocale('/', 'uz')).toBe('/uz');
    expect(withLocale('/pricing', 'ru')).toBe('/ru/pricing');
  });

  it('round-trips with the split', () => {
    for (const path of ['/', '/pricing', '/r/osh-xona/menu', '/crew/lock/owner']) {
      for (const locale of URL_LOCALES) {
        expect(splitLocale(withLocale(path, locale))).toEqual({ locale, bare: path });
      }
    }
  });
});

describe('what never gets a language', () => {
  it('leaves the API alone', () => {
    expect(skipsLocale('/api/health')).toBe(true);
    expect(skipsLocale('/api')).toBe(true);
    // …and does not mistake a page for one.
    expect(skipsLocale('/apitest')).toBe(false);
  });

  it('leaves files alone', () => {
    // A file at a moved URL is a 404, and three of these are how the app
    // installs itself.
    for (const path of [
      '/sw.js',
      '/manifest.json',
      '/robots.txt',
      '/sitemap.xml',
      '/r/osh-xona/sitemap.xml',
      '/r/osh-xona/manifest.webmanifest',
      '/icons/apple-180.png',
    ]) {
      expect(skipsLocale(path), path).toBe(true);
    }
  });

  it("leaves Next's own metadata routes alone", () => {
    /*
     * These are served without an extension and linked by absolute path from
     * the `<head>` Next generates. Prefixing them turns every share card on
     * the site into a broken image — and nothing would report it, because the
     * page itself renders perfectly.
     */
    expect(skipsLocale('/opengraph-image')).toBe(true);
    expect(skipsLocale('/r/osh-xona/opengraph-image')).toBe(true);
    expect(skipsLocale('/twitter-image')).toBe(true);
    expect(skipsLocale('/apple-icon')).toBe(true);
  });

  it('lets ordinary pages through', () => {
    for (const path of ['/', '/pricing', '/dashboard', '/r/osh-xona', '/crew/owner/branches']) {
      expect(skipsLocale(path), path).toBe(false);
    }
  });
});

describe('which language a request with no prefix gets', () => {
  it('takes the cookie over the header', () => {
    expect(preferredLocale('ru', 'en-GB,en;q=0.9')).toBe('ru');
  });

  it('takes the header when there is no cookie', () => {
    expect(preferredLocale(undefined, 'ru-RU,ru;q=0.9')).toBe('ru');
    expect(preferredLocale(undefined, 'EN-gb')).toBe('en');
  });

  it('answers Uzbek when nothing spoke, or spoke nonsense', () => {
    expect(preferredLocale(undefined, '')).toBe('uz');
    expect(preferredLocale('tr', 'tr-TR')).toBe('uz');
    expect(preferredLocale('../etc/passwd', '')).toBe('uz');
  });
});
