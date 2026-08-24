import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ get: vi.fn() }));
vi.mock('@/lib/storage', () => ({ KEYS: { crewSession: 'crew-session' } }));
vi.mock('./session', () => ({ enrolment: async () => ({ tenant: 'osh-markazi' }) }));

import { get } from '@/lib/api';

import { baseUnits, inPurchaseUnits, ingredientFrom, itemForBarcode } from './inventory';

/**
 * The two things on the barcode screen that can be wrong without looking wrong.
 *
 * A camera that fails to decode is obvious the moment somebody points it at a
 * box. A factor applied the wrong way round is not: the screen fills in, the
 * button works, the count saves — and five kilos of beef is recorded as five
 * grams, which posts a write-off of the entire shelf and balances perfectly.
 *
 * The query shape is here for the same reason. `GET inventory/items` takes a
 * plain `?barcode=`, while the ingredients route next door is a Spatie query
 * builder that takes `?filter[barcode]=`. Send the bracket form to the wrong
 * one and it does not fail — it ignores the unknown parameter and answers the
 * empty list the controller falls back to, so every scan reports "not in the
 * store" and a delivery gets booked against nothing.
 */
const asked = vi.mocked(get);

beforeEach(() => {
  asked.mockReset();
});

const row = {
  id: 41,
  sku: 'BEEF-01',
  barcode: '4780123001927',
  name: "Mol go'shti, muzlatilgan",
  unit: 'g',
  purchase_unit: 'kg',
  factor: 1000,
  stock_quantity: 12_000,
  min_quantity: 8_000,
  is_low: false,
};

describe('baseUnits', () => {
  it('multiplies a purchase quantity up into base units', () => {
    // Five kilos is five thousand grams. Inverted, this is the bug that empties
    // a shelf on paper.
    expect(baseUnits('5', 1000)).toBe(5_000);
  });

  it('takes a comma as a decimal point, because the keypad offers both', () => {
    expect(baseUnits('12,5', 1000)).toBe(12_500);
    expect(baseUnits('12.5', 1000)).toBe(12_500);
  });

  it('leaves a factor of one alone', () => {
    // Pieces are counted in pieces. Nothing to convert, and nothing converted.
    expect(baseUnits('24', 1)).toBe(24);
  });

  it('rounds to a whole base unit, because the column is an integer', () => {
    expect(baseUnits('0.3335', 1000)).toBe(334);
  });

  it('answers null for everything that is not a count', () => {
    // A negative count is not a small quantity, it is a typo — and the server
    // validates `integer|min:0`, so sending one is a refused entry the person
    // finds out about later.
    expect(baseUnits('', 1000)).toBeNull();
    expect(baseUnits('   ', 1000)).toBeNull();
    expect(baseUnits('-4', 1000)).toBeNull();
    expect(baseUnits('kg', 1000)).toBeNull();
  });

  it('accepts zero, which is a real answer about a shelf', () => {
    // "There are none left" is the single most important count a storekeeper
    // takes, and it must not be treated as an empty field.
    expect(baseUnits('0', 1000)).toBe(0);
  });
});

describe('inPurchaseUnits', () => {
  it('is the inverse, for the figure shown back to the person', () => {
    expect(inPurchaseUnits(12_000, 1000)).toBe(12);
    expect(inPurchaseUnits(4_750, 1000)).toBe(4.75);
    expect(inPurchaseUnits(24, 1)).toBe(24);
  });
});

describe('ingredientFrom', () => {
  it('carries the fields the screen draws', () => {
    expect(ingredientFrom(row)).toEqual({
      id: 41,
      sku: 'BEEF-01',
      name: "Mol go'shti, muzlatilgan",
      unit: 'g',
      purchaseUnit: 'kg',
      factor: 1000,
      onHand: 12_000,
      minimum: 8_000,
      low: false,
    });
  });

  it('refuses a factor below one', () => {
    // It is a multiplier and a divisor. A zero from anywhere turns every count
    // into zero or NaN, and neither is visible on the screen.
    expect(ingredientFrom({ ...row, factor: 0 }).factor).toBe(1);
  });

  it('falls back to the base unit when nothing bigger is named', () => {
    expect(ingredientFrom({ ...row, purchase_unit: '' }).purchaseUnit).toBe('g');
  });
});

describe('itemForBarcode', () => {
  it('asks with a plain barcode parameter, not the filter form', async () => {
    asked.mockResolvedValue({ data: [row] });

    await itemForBarcode('4780123001927');

    expect(asked.mock.calls[0]?.[0]).toBe('/inventory/items?barcode=4780123001927');
  });

  it('answers null for a code the store has never registered', async () => {
    // The endpoint returns an empty list rather than a 404, and "no such code"
    // is an ordinary answer a storekeeper acts on.
    asked.mockResolvedValue({ data: [] });

    await expect(itemForBarcode('0000000000000')).resolves.toBeNull();
  });

  it('lets a failure through rather than flattening it into "unknown"', async () => {
    // The screen tells a dead connection apart from an unregistered code, and
    // it can only do that if this does not swallow the difference.
    asked.mockRejectedValue(new Error('offline'));

    await expect(itemForBarcode('4780123001927')).rejects.toThrow('offline');
  });
});
