import { describe, expect, it } from 'vitest';

import { fixturePad, linesFor, padFrom, suggestedFor, termsOf } from './order-pad';
import type { StockRow } from '../inventory/inventory-data';

/**
 * The pad that raises a purchase order.
 *
 * Worth a test because the failure it replaced was silent: the tab ran on four
 * supplier names and a price list typed into the design file, and pressing Send
 * flashed `XB-0185 yuborildi` — the same invented number every time — while
 * posting nothing. A buyer believed an order had gone to a company this
 * restaurant does not deal with.
 *
 * Two things have to hold now. Nothing on the fixture pad may carry an id,
 * because an id is what lets the panel post; and the live pad's arithmetic —
 * the suggested quantity, and the conversion from what a storekeeper counts to
 * what the document is written in — has to match the store screen's, which
 * sends the same lines through the same route.
 */
function shelf(over: Partial<StockRow> = {}): StockRow {
  return {
    id: '7',
    name: "Mol go'shti",
    unit: 'unitKg',
    baseUnit: 'g',
    factor: 1000,
    price: 78_000_00,
    shelfLife: 4,
    store: 'main',
    onHand: 12,
    par: 40,
    supplier: "Farg'ona Meat",
    supplierId: '3',
    lastMove: null,
    ...over,
  } as StockRow;
}

const supplier = (over: Record<string, unknown> = {}) => ({
  id: 3,
  name: "Farg'ona Meat",
  phone: '+998 90 123 45 67',
  contact_name: 'Aziz',
  email: 'aziz@example.uz',
  lead_time_days: 1,
  payment_terms_days: 14,
  is_active: true,
  ...over,
});

const words = { cash: 'Yetkazishda naqd', net: '{n} kun kechiktirilgan' };
const unitWord = (row: StockRow) => (row.unit === 'unitKg' ? 'kg' : 'dona');

describe('termsOf', () => {
  it('reads a credit period as one', () => {
    expect(termsOf(14, words)).toBe('14 kun kechiktirilgan');
  });

  it('reads no credit period as cash on delivery', () => {
    // Zero days and no answer are the same fact to a buyer: pay the driver.
    expect(termsOf(0, words)).toBe('Yetkazishda naqd');
    expect(termsOf(null, words)).toBe('Yetkazishda naqd');
  });
});

describe('padFrom', () => {
  it('carries the row ids that let the panel post', () => {
    const pad = padFrom([supplier()], [shelf()], unitWord, words);

    expect(pad.live).toBe(true);
    expect(pad.suppliers[0]).toMatchObject({
      supplierId: 3,
      lead: 1,
      terms: '14 kun kechiktirilgan',
    });
    expect(pad.lines[0]).toMatchObject({ ingredientId: 7, unit: 'kg', factor: 1000 });
  });

  it('prices the line per base unit, which is how the document is written', () => {
    // 78 000 so'm a kilo is 7 800 tiyin a gram. The store screen's order
    // button sends exactly this figure; two roundings of it would drift.
    const pad = padFrom([supplier()], [shelf({ price: 78_000_00, factor: 1000 })], unitWord, words);

    expect(pad.lines[0]?.priceBase).toBe(7_800);
  });

  it('does not offer a delisted supplier to order from', () => {
    const pad = padFrom([supplier({ is_active: false })], [shelf()], unitWord, words);

    expect(pad.suppliers).toEqual([]);
  });

  it('falls back through the contact details a buyer can actually ring', () => {
    const only = padFrom([supplier({ phone: null })], [shelf()], unitWord, words);

    expect(only.suppliers[0]?.contact).toBe('Aziz');
  });

  it('puts the shortest shelf at the top, which is what the tab is opened for', () => {
    const pad = padFrom(
      [supplier()],
      [
        shelf({ id: '1', name: 'Stocked', onHand: 50, par: 10 }),
        shelf({ id: '2', name: 'Short', onHand: 2, par: 40 }),
      ],
      unitWord,
      words,
    );

    expect(pad.lines.map((line) => line.name)).toEqual(['Short', 'Stocked']);
  });

  it('measures nothing it cannot measure', () => {
    // Days of cover needs a usage history the ingredients endpoint has none of.
    const pad = padFrom([supplier()], [shelf()], unitWord, words);

    expect(pad.lines[0]?.daily).toBeNull();
  });
});

describe('fixturePad', () => {
  it('cannot post: no supplier and no line carries an id', () => {
    const pad = fixturePad('uz');

    expect(pad.live).toBe(false);
    expect(pad.suppliers.every((row) => row.supplierId === null)).toBe(true);
    expect(pad.lines.every((line) => line.ingredientId === null)).toBe(true);
  });

  it('keeps the design’s catalogue keyed by the supplier it belongs to', () => {
    const pad = fixturePad('uz');
    const first = pad.suppliers[0]!;

    const lines = linesFor(pad, first.id);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.id.startsWith(`${first.id}:`))).toBe(true);
    expect(lines.length).toBeLessThan(pad.lines.length);
  });
});

describe('linesFor', () => {
  it('offers the whole shelf against whoever is chosen, once it is live', () => {
    /*
     * No table says which company sells which ingredient, so narrowing by
     * supplier would show a buyer an empty catalogue on their first order —
     * which is exactly when they need it.
     */
    const pad = padFrom(
      [supplier(), supplier({ id: 4, name: 'Milko' })],
      [shelf()],
      unitWord,
      words,
    );

    expect(linesFor(pad, '4')).toHaveLength(1);
  });
});

describe('suggestedFor', () => {
  it('proposes the gap, rounded up to a whole pack', () => {
    expect(suggestedFor({ have: 12, need: 40, pack: 5 } as never)).toBe(30);
  });

  it('proposes nothing for a shelf that is already above par', () => {
    expect(suggestedFor({ have: 50, need: 40, pack: 5 } as never)).toBe(0);
  });

  it('survives a pack size of zero rather than dividing by it', () => {
    expect(suggestedFor({ have: 0, need: 3, pack: 0 } as never)).toBe(3);
  });
});
