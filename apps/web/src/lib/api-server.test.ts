import { describe, expect, it } from 'vitest';

import { translate } from './api-server';

/**
 * Reading a `{uz, ru, en}` column.
 *
 * Every user-facing name in the database is stored this way, and the reason
 * this has its own test is the fallback: a restaurant enters a dish in Uzbek
 * and nothing else, then someone opens the console in English. Returning the
 * empty string there would draw a menu of blank rows — technically correct
 * about what was translated, useless as a menu.
 */
describe('translate', () => {
  it('returns the reader’s language when it is there', () => {
    const name = { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' };

    expect(translate(name, 'uz')).toBe("Ko'k choy");
    expect(translate(name, 'ru')).toBe('Зелёный чай');
    expect(translate(name, 'en')).toBe('Green tea');
  });

  it('falls through rather than rendering a blank cell', () => {
    // Uzbek first because it is the authoring language: a dish entered once is
    // entered in Uzbek, and that is the name on the wall in the kitchen.
    expect(translate({ uz: 'Somsa' }, 'en')).toBe('Somsa');
    expect(translate({ ru: 'Самса' }, 'en')).toBe('Самса');
    expect(translate({ en: 'Samsa' }, 'ru')).toBe('Samsa');
  });

  it('survives what the API can actually send', () => {
    // Older resources return a plain string for the same column, and a column
    // never filled in returns null. Neither may throw inside a table row.
    expect(translate('Osh', 'uz')).toBe('Osh');
    expect(translate(null, 'uz')).toBe('');
    expect(translate(undefined, 'uz')).toBe('');
    expect(translate({}, 'uz')).toBe('');
  });

  it('does not treat an unknown locale as a reason to give up', () => {
    // A locale the catalogue does not carry — a `kk` cookie, a stray header —
    // still gets a legible name.
    expect(translate({ uz: 'Osh', en: 'Pilaf' }, 'kk')).toBe('Osh');
  });
});
