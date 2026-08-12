import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, LANGUAGE_OPTIONS, SUPPORTED_LOCALES, messages } from './index';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from './locale';

/**
 * The three catalogues have to stay the same shape and different words.
 *
 * TypeScript already guarantees the shape — ./ru.ts and ./en.ts are typed
 * against ./uz.ts. What it cannot catch is a catalogue that type-checks because
 * someone pasted the Uzbek in, which is exactly the failure that ships a
 * half-translated console.
 */

/** Every leaf string, as `a.b.c` → value. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value === null || typeof value !== 'object') return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, child]) => Object.assign(acc, flatten(child, prefix ? `${prefix}.${key}` : key)),
    {},
  );
}

const flat = {
  uz: flatten(messages.uz.platform, 'platform'),
  ru: flatten(messages.ru.platform, 'platform'),
  en: flatten(messages.en.platform, 'platform'),
};

describe('the platform catalogues', () => {
  it('covers the three languages the product sells in', () => {
    expect(SUPPORTED_LOCALES).toEqual(['uz', 'ru', 'en']);
    expect(DEFAULT_LOCALE).toBe('uz');
    expect(LANGUAGE_OPTIONS).toHaveLength(3);
  });

  it('has the same keys in all three', () => {
    const uz = Object.keys(flat.uz).sort();
    expect(Object.keys(flat.ru).sort()).toEqual(uz);
    expect(Object.keys(flat.en).sort()).toEqual(uz);
  });

  it('leaves no string empty', () => {
    for (const [locale, catalogue] of Object.entries(flat)) {
      for (const [key, value] of Object.entries(catalogue)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  /**
   * Proper nouns and units are the same word in every language; everything else
   * must differ. The list is explicit so adding to it is a decision somebody
   * makes on purpose rather than a translation quietly going missing.
   */
  it('actually translates, rather than copying the Uzbek across', () => {
    const SHARED = new Set([
      'platform.shell.product',
      'platform.settings.email',
      'platform.settings.sms',
      'platform.plans.payme',
      'platform.method.payme',
      'platform.telegram.sections.broadcast',
      'platform.telegram.broadcast',
      'platform.extra.tgSettings.webhook',
    ]);

    const copied = Object.entries(flat.uz).filter(
      ([key, value]) => !SHARED.has(key) && flat.ru[key] === value,
    );

    expect(copied.map(([key]) => key)).toEqual([]);
  });

  it('keeps money and units out of the catalogue', () => {
    /* Figures live in platform-data.ts; a number here would eventually disagree. */
    const suspicious = Object.entries(flat.uz).filter(
      ([key, value]) => /^\s*[\d\s]{4,}$/.test(value) && !key.includes('platformSettings'),
    );

    expect(suspicious).toEqual([]);
  });
});

describe('the locale cookie', () => {
  it('is named apart from the restaurant console, and lasts a year', () => {
    expect(LOCALE_COOKIE).toBe('restaurant-campus-admin-locale');
    expect(LOCALE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });
});
