import { describe, expect, it } from 'vitest';

import { messages, SUPPORTED_LOCALES } from './index';
import { uz } from './uz';
import { ru } from './ru';
import { en } from './en';

/**
 * The three catalogues have to stay in step.
 *
 * `ru.ts` and `en.ts` are typed as `WebMessages`, so a missing or misspelled
 * key is already a compile error — that is the reason these are TypeScript and
 * not JSON. What the type cannot see is a key that exists but was left empty,
 * or a placeholder that survives in one language and is dropped in another,
 * and both of those reach a reader as a blank line or a literal `{name}`.
 */

const CATALOGUES = { uz, ru, en } as const;

/** Every leaf string in a catalogue, keyed by its dotted path. */
function flatten(node: unknown, prefix = ''): Record<string, string> {
  if (typeof node === 'string') return { [prefix]: node };
  if (typeof node !== 'object' || node === null) return {};

  return Object.entries(node).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return { ...all, ...flatten(value, path) };
  }, {});
}

const flat = {
  uz: flatten(uz),
  ru: flatten(ru),
  en: flatten(en),
};

describe('web message catalogues', () => {
  it('carries the same keys in every language', () => {
    const keys = Object.keys(flat.uz).sort();

    expect(Object.keys(flat.ru).sort()).toEqual(keys);
    expect(Object.keys(flat.en).sort()).toEqual(keys);
  });

  it('leaves nothing blank', () => {
    for (const [locale, entries] of Object.entries(flat)) {
      for (const [path, value] of Object.entries(entries)) {
        expect(value.trim(), `${locale}.${path} is empty`).not.toBe('');
      }
    }
  });

  it('keeps every placeholder in every language', () => {
    const placeholders = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

    for (const [path, uzValue] of Object.entries(flat.uz)) {
      const expected = placeholders(uzValue);
      if (expected.length === 0) continue;

      expect(placeholders(flat.ru[path]), `ru.${path} lost a placeholder`).toEqual(expected);
      expect(placeholders(flat.en[path]), `en.${path} lost a placeholder`).toEqual(expected);
    }
  });

  it('merges the shared catalogue under the app’s own', () => {
    // packages/i18n holds what the admin console says too. If the merge broke,
    // the console would render its own copy and lose every shared button verb.
    for (const locale of SUPPORTED_LOCALES) {
      expect(messages[locale].common.save, `${locale} lost the shared namespace`).toBeTruthy();
      expect(messages[locale].console.shell.tagline, `${locale} lost its own`).toBeTruthy();
    }
  });

  it('does not let a translation quietly fall back to Uzbek', () => {
    // Nothing here should read the same in Uzbek and Russian: this is prose,
    // and anything identical is either untranslated or is not copy at all.
    //
    // The check earns its keep. It first ran at 63 of 334, and every one of
    // those was a figure, an id or a proper noun sitting in the catalogue —
    // "42", "01", "RK", a branch name, a timestamp. Those moved to site-data.ts
    // and shell-data.ts, where they are written once instead of three times.
    const identical = Object.keys(flat.uz).filter((path) => flat.uz[path] === flat.ru[path]);

    expect(identical, 'these are data, not copy — move them out of the catalogue').toEqual([]);
  });
});

for (const locale of SUPPORTED_LOCALES) {
  it(`exposes ${locale} through the merged export`, () => {
    expect(messages[locale]).toBeDefined();
    expect(CATALOGUES[locale]).toBeDefined();
  });
}
