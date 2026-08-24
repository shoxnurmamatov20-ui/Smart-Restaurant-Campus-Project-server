import { describe, expect, it } from 'vitest';

import {
  pricedShelfFrom,
  roundFrom,
  suppliersFrom,
  swapOptionsFrom,
  type ApiIngredient,
  type ApiRiderDrop,
  type ApiUpcoming,
} from './live';

/**
 * The four mappings the More forms and the cash tab were missing.
 *
 * Each of them exists to turn an API row into a **database id** a payload can
 * carry. That is not incidental: every one of these screens composed its
 * request perfectly and sent nothing, because `w1`, `p1`, "Payshanba" and a
 * hand-back reason are not `ingredient_id`, `supplier_id`, `shift_id` and
 * `order_id`.
 */

const shelf: ApiIngredient[] = [
  {
    id: 12,
    name: { uz: "Mol go'shti", ru: 'Говядина', en: 'Beef' },
    unit: 'kg',
    stock_quantity: 4,
    min_quantity: 20,
    price_tiyin: 6_200_000,
  },
  {
    id: 13,
    name: { uz: 'Guruch', ru: 'Рис', en: 'Rice' },
    unit: 'kg',
    stock_quantity: 48,
    min_quantity: 20,
  },
];

describe('pricedShelfFrom', () => {
  it('carries the database id, which is what a write-off is keyed on', () => {
    expect(pricedShelfFrom(shelf, 'uz')[0]?.id).toBe('12');
  });

  it('reads the name the API already resolved rather than translating again', () => {
    const rows = pricedShelfFrom(shelf, 'ru');

    expect(rows[0]?.name.ru).toBe('Говядина');
    // The same string in all three slots: the column was resolved for this
    // reader's locale, and re-reading it here would answer a different question.
    expect(rows[0]?.name.en).toBe('Говядина');
  });

  it('suggests the gap to the minimum and nothing cleverer', () => {
    const rows = pricedShelfFrom(shelf, 'uz');

    expect(rows[0]?.suggested).toBe(16);
    // Above the minimum there is nothing to order, and a sheet that suggested
    // one anyway is a sheet a storekeeper stops reading.
    expect(rows[1]?.suggested).toBe(0);
  });

  it('prices an uncosted row at zero rather than inventing a figure', () => {
    // A running total is money about to leave the business. A guessed unit cost
    // is a guessed loss on a food-cost report nobody can trace back.
    expect(pricedShelfFrom(shelf, 'uz')[1]?.unitTiyin).toBe(0);
  });
});

describe('suppliersFrom', () => {
  it('drops the ones this restaurant stopped buying from', () => {
    const rows = suppliersFrom([
      { id: 3, name: "Farg'ona Meat" },
      { id: 4, name: 'Eski Bozor', is_active: false },
    ]);

    // Dimmed rather than dropped is how a wrong row gets tapped on a phone at a
    // service entrance.
    expect(rows.map((row) => row.id)).toEqual(['3']);
  });
});

describe('swapOptionsFrom', () => {
  const answer: ApiUpcoming = {
    shifts: [
      {
        id: 91,
        starts_at: '2026-08-27T18:00:00+05:00',
        ends_at: '2026-08-28T02:00:00+05:00',
        role: 'waiter',
      },
    ],
    colleagues: [{ id: 7, full_name: 'Aziza Karimova', position: 'waiter' }],
  };

  it('keeps the shift id, which is what the form had no way of naming', () => {
    expect(swapOptionsFrom(answer, 'en').shifts[0]?.id).toBe('91');
  });

  it('writes a date beside the weekday, because a weekday names four Thursdays', () => {
    const day = swapOptionsFrom(answer, 'en').shifts[0]?.day ?? '';

    expect(day).toContain('27');
    expect(day.toLowerCase()).toContain('august');
  });

  it('spans midnight without wrapping the end time backwards', () => {
    // An 18:00–02:00 bar shift is one shift, and the label has to read like one.
    expect(swapOptionsFrom(answer, 'en').shifts[0]?.time).toBe('18:00 – 02:00');
  });

  it('gives a colleague an id, a name and initials and nothing else', () => {
    const person = swapOptionsFrom(answer, 'en').colleagues[0];

    expect(person).toEqual({ id: '7', name: 'Aziza Karimova', initials: 'AK', role: 'waiter' });
  });
});

describe('roundFrom', () => {
  const drops: ApiRiderDrop[] = [
    {
      id: 41,
      status: 'picked',
      order: {
        id: 2839,
        number: 'OX-2839',
        address: 'Chilonzor 19',
        total_tiyin: 9_400_000,
        collect_tiyin: 9_400_000,
      },
    },
    { id: 42, status: 'picked', order: null },
  ];

  it('answers the ORDER id — `delivery_status` is keyed on the bill', () => {
    expect(roundFrom(drops)[0]?.id).toBe('2839');
  });

  it('drops a row whose order did not come down', () => {
    // It cannot be handed back, marked delivered or counted into the cash the
    // rider declares — drawing it would put a line on screen no button works on.
    expect(roundFrom(drops)).toHaveLength(1);
  });

  it('keeps what is owed at the door apart from what the order was worth', () => {
    const paid = roundFrom([
      {
        id: 43,
        status: 'picked',
        order: { id: 2840, number: 'OX-2840', total_tiyin: 5_400_000, collect_tiyin: 0 },
      },
    ]);

    // A card payment already reached the restaurant; putting it on a hand-over
    // list would have a cashier counting notes nobody collected.
    expect(paid[0]?.collectTiyin).toBe(0);
  });
});
