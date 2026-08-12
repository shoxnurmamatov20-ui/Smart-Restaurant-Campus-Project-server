import { describe, expect, it } from 'vitest';

import {
  cn,
  entries,
  formatCurrency,
  formatNumber,
  formatTiyin,
  formatTiyinAmount,
  keys,
  truncate,
} from './index';

/** Strip the spaces and non-breaking spaces Intl inserts between digit groups. */
const digits = (value: string) => value.replace(/[\s  ]/g, '');

/**
 * The helpers every surface on the platform formats through.
 *
 * These used to be tested from inside apps/web, which only re-exported them —
 * so the money tests belonged to whichever app happened to import the package,
 * and deleting that app would have taken them with it. They live with the code
 * they cover now.
 *
 * The money ones matter most: prices cross the wire as integer tiyin
 * (1 UZS = 100 tiyin), and formatting one of those as if it were so'm prints a
 * hundredfold price — the kind of bug a guest notices before anyone else.
 */
describe('formatTiyin', () => {
  it('renders a 45 000 so’m dish as 45 000, not 4 500 000', () => {
    expect(digits(formatTiyin(4500000))).toContain('45000');
  });

  it('renders a free item as zero rather than as nothing', () => {
    expect(digits(formatTiyin(0))).toContain('0');
  });
});

describe('formatCurrency', () => {
  it('formats a whole-unit amount', () => {
    expect(digits(formatCurrency(45000))).toContain('45000');
  });
});

describe('formatTiyinAmount', () => {
  it('groups the figure and leaves the currency off', () => {
    const rendered = formatTiyinAmount(1_842_000_000);

    expect(digits(rendered)).toBe('18420000');
    // The unit is a separate element in the UI, so it must not be baked in.
    expect(rendered).not.toMatch(/UZS|so'm|сум/i);
  });

  it('divides by a hundred exactly once', () => {
    expect(digits(formatTiyinAmount(4_500_000))).toBe('45000');
  });
});

describe('formatNumber', () => {
  it('groups thousands so a six-figure takings figure is readable', () => {
    expect(digits(formatNumber(1234567))).toBe('1234567');
    expect(formatNumber(1234567)).not.toBe('1234567');
  });

  it('writes the same figure in every environment', () => {
    // Not a style preference — a guard. `Intl.NumberFormat('uz-UZ')` groups
    // with a space under Node and with a comma in Chrome, so a figure formatted
    // during a server render and re-formatted after hydration used to disagree.
    // Pinning the separators is what stops a price changing shape mid-page.
    //
    // Built rather than typed: the separator is a non-breaking space, and a
    // plain one pasted into this file would pass for it by eye.
    const nbsp = String.fromCharCode(160);

    expect(formatNumber(2_400_000, 'uz')).toBe(`2${nbsp}400${nbsp}000`);
    expect(formatNumber(2_400_000, 'ru')).toBe(`2${nbsp}400${nbsp}000`);
    expect(formatNumber(2_400_000, 'en')).toBe('2,400,000');
  });

  it('marks the decimal the way each language does', () => {
    expect(formatNumber(4.2, 'uz')).toBe('4,2');
    expect(formatNumber(4.2, 'en')).toBe('4.2');
  });
});

describe('truncate', () => {
  it('leaves a short dish name alone', () => {
    expect(truncate('Osh', 20)).toBe('Osh');
  });

  it('shortens a long one', () => {
    const long = 'Qo’y go’shtli maxsus to’yona palov';
    expect(truncate(long, 12).length).toBeLessThanOrEqual(13);
  });
});

describe('cn', () => {
  it('drops falsy classes so conditional styling does not leak "false" into the DOM', () => {
    expect(cn('px-2', false && 'hidden', undefined, 'py-1')).toBe('px-2 py-1');
  });

  it('lets a later utility beat an earlier one in the same Tailwind group', () => {
    // The whole reason cn wraps twMerge rather than just clsx: a component's
    // own `p-4` must lose to a caller's `p-8`, not fight it in the class list.
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });
});

describe('typed Object helpers', () => {
  it('reads back the keys and entries it was given', () => {
    const menu = { osh: 4500000, somsa: 1200000 };

    expect(keys(menu)).toEqual(['osh', 'somsa']);
    expect(entries(menu)).toEqual([
      ['osh', 4500000],
      ['somsa', 1200000],
    ]);
  });
});
