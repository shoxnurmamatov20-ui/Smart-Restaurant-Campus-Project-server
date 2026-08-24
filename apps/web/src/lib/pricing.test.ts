import { describe, expect, it } from 'vitest';

import {
  billTotals,
  cashRoundingDelta,
  CASH_ROUNDING_TIYIN,
  chargesService,
  percentOf,
  roundedForCash,
  SERVICE_PERCENT,
  splitEvenly,
  VAT_PERCENT,
  type OrderChannel,
} from '@restaurant/surfaces/money';

/**
 * The browser's copy of the bill, checked against the server's.
 *
 * Every expected figure in the first table was produced by running
 * `App\Support\Orders\BillTotals::of()` — the PHP a receipt, a fiscal driver, a
 * Z report and a dispute all read from — and pasting what it answered. They are
 * not this file's own arithmetic restated, which would only prove the test
 * agrees with itself.
 *
 * That distinction is the whole point. `pricing.ts` exists because there is no
 * endpoint that quotes a total to a guest's phone, so four screens compute one
 * locally; the failure mode it guards against is the phone showing one number
 * and the printed cheque showing another, in front of the guest, with the
 * cashier standing there. A drift in either direction has to fail here.
 *
 * When the intake endpoint lands and these become a server quote, this file is
 * what proves the replacement did not change any figure.
 */

/** Straight from `BillTotals::of()`. Do not hand-edit — re-run the PHP. */
const FROM_THE_SERVER: readonly {
  channel: OrderChannel;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  want: {
    subtotal: number;
    discount: number;
    service_charge: number;
    delivery_fee: number;
    vat_included: number;
    total: number;
  };
}[] = [
  {
    channel: 'dine_in',
    subtotal: 4_500_000,
    discount: 0,
    deliveryFee: 0,
    want: {
      subtotal: 4_500_000,
      discount: 0,
      service_charge: 450_000,
      delivery_fee: 0,
      vat_included: 530_357,
      total: 4_950_000,
    },
  },
  {
    channel: 'dine_in',
    subtotal: 10_000_000,
    discount: 1_000_000,
    deliveryFee: 0,
    want: {
      subtotal: 10_000_000,
      discount: 1_000_000,
      service_charge: 900_000,
      delivery_fee: 0,
      vat_included: 1_060_714,
      total: 9_900_000,
    },
  },
  {
    channel: 'takeaway',
    subtotal: 4_500_000,
    discount: 0,
    deliveryFee: 0,
    want: {
      subtotal: 4_500_000,
      discount: 0,
      service_charge: 0,
      delivery_fee: 0,
      vat_included: 482_143,
      total: 4_500_000,
    },
  },
  {
    channel: 'delivery',
    subtotal: 4_500_000,
    discount: 0,
    deliveryFee: 1_200_000,
    want: {
      subtotal: 4_500_000,
      discount: 0,
      service_charge: 0,
      delivery_fee: 1_200_000,
      vat_included: 482_143,
      total: 5_700_000,
    },
  },
  {
    channel: 'delivery',
    subtotal: 25_000_000,
    discount: 0,
    deliveryFee: 0,
    want: {
      subtotal: 25_000_000,
      discount: 0,
      service_charge: 0,
      delivery_fee: 0,
      vat_included: 2_678_571,
      total: 25_000_000,
    },
  },
  {
    channel: 'dine_in',
    subtotal: 333_333,
    discount: 0,
    deliveryFee: 0,
    want: {
      subtotal: 333_333,
      discount: 0,
      service_charge: 33_333,
      delivery_fee: 0,
      vat_included: 39_286,
      total: 366_666,
    },
  },
  {
    // A discount larger than the food. Clamped, not refused.
    channel: 'dine_in',
    subtotal: 1_000_000,
    discount: 5_000_000,
    deliveryFee: 0,
    want: {
      subtotal: 1_000_000,
      discount: 1_000_000,
      service_charge: 0,
      delivery_fee: 0,
      vat_included: 0,
      total: 0,
    },
  },
  {
    channel: 'dine_in',
    subtotal: 11_900_000,
    discount: 1_190_000,
    deliveryFee: 0,
    want: {
      subtotal: 11_900_000,
      discount: 1_190_000,
      service_charge: 1_071_000,
      delivery_fee: 0,
      vat_included: 1_262_250,
      total: 11_781_000,
    },
  },
  {
    // One tiyin. Service truncates to nothing and VAT rounds to nothing.
    channel: 'dine_in',
    subtotal: 1,
    discount: 0,
    deliveryFee: 0,
    want: {
      subtotal: 1,
      discount: 0,
      service_charge: 0,
      delivery_fee: 0,
      vat_included: 0,
      total: 1,
    },
  },
  {
    channel: 'aggregator',
    subtotal: 7_777_777,
    discount: 777_777,
    deliveryFee: 333_333,
    want: {
      subtotal: 7_777_777,
      discount: 777_777,
      service_charge: 0,
      delivery_fee: 333_333,
      vat_included: 750_000,
      total: 7_333_333,
    },
  },
];

describe('billTotals — the same answer the server gives', () => {
  it.each(FROM_THE_SERVER)(
    '$channel · $subtotal − $discount + $deliveryFee',
    ({ channel, subtotal, discount, deliveryFee, want }) => {
      const got = billTotals({ subtotal, channel, discount, deliveryFee });

      expect(got.subtotal).toBe(want.subtotal);
      expect(got.discount).toBe(want.discount);
      expect(got.serviceCharge).toBe(want.service_charge);
      expect(got.deliveryFee).toBe(want.delivery_fee);
      expect(got.vatIncluded).toBe(want.vat_included);
      expect(got.total).toBe(want.total);
    },
  );

  it('never lets VAT exceed the total it was read out of', () => {
    // The rule stated as an invariant rather than a case: VAT is extracted, not
    // added, so a bill can never owe more tax than it is worth. An implementation
    // that multiplied by 0.12 instead of dividing by 112 passes the arithmetic
    // cases above only until somebody "fixes" the formula — this catches that.
    for (const { channel, subtotal, discount, deliveryFee } of FROM_THE_SERVER) {
      const got = billTotals({ subtotal, channel, discount, deliveryFee });

      expect(got.vatIncluded).toBeLessThanOrEqual(got.total);
      expect(got.vatIncluded).toBeGreaterThanOrEqual(0);
    }
  });

  it('charges service on the discounted food, not the menu price', () => {
    // 10% of 9 000 000 is 900 000. Of the undiscounted 10 000 000 it would be
    // 1 000 000, which quietly turns a 10% discount into a 9% one.
    const got = billTotals({
      subtotal: 10_000_000,
      channel: 'dine_in',
      discount: 1_000_000,
    });

    expect(got.serviceCharge).toBe(900_000);
  });

  it('keeps the delivery fee out of the tax base', () => {
    const without = billTotals({ subtotal: 4_500_000, channel: 'delivery' });
    const with_ = billTotals({
      subtotal: 4_500_000,
      channel: 'delivery',
      deliveryFee: 1_200_000,
    });

    expect(with_.vatIncluded).toBe(without.vatIncluded);
    expect(with_.total).toBe(without.total + 1_200_000);
  });

  it('truncates service downward and rounds VAT to nearest', () => {
    // 10% of 333 333 is 33 333.3 — kept by the restaurant, so it goes down.
    // The VAT on 366 666 is 39 285.6 — a statement about money that moved, so
    // it goes to nearest. The asymmetry is deliberate and is the thing most
    // likely to be "tidied up" by somebody who has not read why.
    const got = billTotals({ subtotal: 333_333, channel: 'dine_in' });

    expect(got.serviceCharge).toBe(33_333);
    expect(got.vatIncluded).toBe(39_286);
  });

  it('turns service off with a percent of zero even on dine-in', () => {
    expect(
      billTotals({ subtotal: 4_500_000, channel: 'dine_in', servicePercent: 0 }).serviceCharge,
    ).toBe(0);
  });

  it('turns VAT off with a percent of zero', () => {
    expect(
      billTotals({ subtotal: 4_500_000, channel: 'takeaway', vatPercent: 0 }).vatIncluded,
    ).toBe(0);
  });
});

describe('the constants the screens quote', () => {
  it('states the rates the copy promises', () => {
    // Three screens print "QQS 12%" and "Xizmat haqi 10%" from these. A change
    // here without a change to the catalogue is a screen that lies in words
    // while telling the truth in figures.
    expect(VAT_PERCENT).toBe(12);
    expect(SERVICE_PERCENT).toBe(10);
    expect(CASH_ROUNDING_TIYIN).toBe(100_000);
  });

  it('charges service on dine-in and nothing else', () => {
    expect(chargesService('dine_in')).toBe(true);
    expect(chargesService('takeaway')).toBe(false);
    expect(chargesService('delivery')).toBe(false);
    expect(chargesService('aggregator')).toBe(false);
  });
});

describe('cash rounding — DECISIONS Q7', () => {
  it.each([
    [4_950_000, 5_000_000],
    [4_949_999, 4_900_000],
    [4_950_001, 5_000_000],
    [5_000_000, 5_000_000],
    [49_999, 0],
    [50_000, 100_000],
  ])('settles %i to %i', (total, want) => {
    expect(roundedForCash(total)).toBe(want);
  });

  it('reports the difference it created, signed', () => {
    expect(cashRoundingDelta(4_950_000)).toBe(50_000);
    expect(cashRoundingDelta(4_949_999)).toBe(-49_999);
    expect(cashRoundingDelta(5_000_000)).toBe(0);
  });

  it('never moves a bill by more than half a step', () => {
    for (let total = 0; total < 1_000_000; total += 7_919) {
      expect(Math.abs(cashRoundingDelta(total))).toBeLessThanOrEqual(CASH_ROUNDING_TIYIN / 2);
    }
  });
});

describe('percentOf', () => {
  it('rounds to the nearest tiyin', () => {
    // 5% of 25 707 000 is 1 285 350 exactly; 5% of 25 707 001 is 1 285 350.05.
    expect(percentOf(25_707_000, 5)).toBe(1_285_350);
    expect(percentOf(25_707_001, 5)).toBe(1_285_350);
    expect(percentOf(25_707_010, 5)).toBe(1_285_351);
  });

  it('answers zero for zero', () => {
    expect(percentOf(4_500_000, 0)).toBe(0);
    expect(percentOf(0, 10)).toBe(0);
  });
});

describe('splitEvenly', () => {
  it('makes the shares add up to the bill', () => {
    // The invariant a table actually checks. Shares that do not sum to the
    // total is the one arithmetic error four people at a restaurant will find.
    for (const total of [4_950_000, 7_333_333, 100_000, 12_345_678]) {
      for (let ways = 2; ways <= 10; ways += 1) {
        const split = splitEvenly(total, ways);

        expect(split.first + split.each * (ways - 1)).toBe(total);
      }
    }
  });

  it('floors each share to a whole 1 000 so’m and puts the rest on the first', () => {
    const split = splitEvenly(4_950_000, 4);

    // 49 500 so'm over four is 12 375 — floored to 12 000, remainder on cheque one.
    expect(split.each).toBe(1_200_000);
    expect(split.first).toBe(1_350_000);
    expect(split.ways).toBe(4);
  });

  it('refuses to split fewer than two ways', () => {
    // A "split" of one is the whole bill, and a split of zero is a division by
    // zero. Both clamp to two rather than answering something unusable.
    expect(splitEvenly(4_950_000, 1).ways).toBe(2);
    expect(splitEvenly(4_950_000, 0).ways).toBe(2);
  });
});
