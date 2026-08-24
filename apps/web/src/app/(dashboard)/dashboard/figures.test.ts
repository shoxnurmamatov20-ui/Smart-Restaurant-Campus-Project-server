import { describe, expect, it } from 'vitest';

import { DASH, delta, peakOf, rail, show } from './figures';

describe('show', () => {
  it('formats a figure and dashes a null', () => {
    expect(show(12, (value) => `${value} ta`)).toBe('12 ta');
    expect(show(0, (value) => `${value} ta`)).toBe('0 ta');
    expect(show(null, (value) => `${value} ta`)).toBe(DASH);
  });
});

describe('rail', () => {
  it('measures the fixture against the design’s own target', () => {
    expect(rail(false, 9, 18)).toBe(50);
  });

  it('draws no rail on a live tenant, whatever the figure is', () => {
    expect(rail(true, 9, 18)).toBeNull();
    expect(rail(true, 0, 18)).toBeNull();
  });

  it('draws no rail without a figure or without a denominator', () => {
    expect(rail(false, null, 18)).toBeNull();
    expect(rail(false, 9, 0)).toBeNull();
  });
});

describe('delta', () => {
  it('keeps the design’s chip on the fixture and drops it live', () => {
    expect(delta(false, '+9.2%')).toBe('+9.2%');
    expect(delta(true, '+9.2%')).toBeUndefined();
  });
});

describe('peakOf', () => {
  it('is zero rather than -Infinity on an empty list', () => {
    expect(peakOf([])).toBe(0);
    expect(peakOf([3, 9, 4])).toBe(9);
  });
});
