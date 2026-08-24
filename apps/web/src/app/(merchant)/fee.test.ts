import { describe, expect, it } from 'vitest';

import { feeOf } from './merchant-data';

/**
 * A merchant's own rate, never the design's.
 *
 * Three screens multiplied `MARKETPLACE_COMMISSION_PERCENT` (nine) themselves,
 * so a store on twelve read a fee it had never agreed to on the screen where
 * it checks it was paid. The API answers both figures per order — a promotion
 * can move the rate for a single one — and this is the only place they are read.
 */
describe('feeOf', () => {
  it('uses the order’s own commission when the API answered it', () => {
    expect(feeOf({ gross: 10_000_00, fee: 1_200_00, feePercent: 12 })).toEqual({
      fee: 1_200_00,
      percent: 12,
      net: 8_800_00,
    });
  });

  it('falls back to the design’s rate only for a fixture row', () => {
    expect(feeOf({ gross: 10_000_00, fee: null, feePercent: null })).toEqual({
      fee: 900_00,
      percent: 9,
      net: 9_100_00,
    });
  });

  it('trusts the API’s tiyin even when they disagree with the percentage', () => {
    // A waived fee on a promoted order: the figure is the agreement, not the
    // arithmetic, and the screen must show what will actually be withheld.
    expect(feeOf({ gross: 10_000_00, fee: 0, feePercent: 9 })).toEqual({
      fee: 0,
      percent: 9,
      net: 10_000_00,
    });
  });
});
