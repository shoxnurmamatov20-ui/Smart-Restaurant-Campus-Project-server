import { describe, expect, it } from 'vitest';

import { budgetFrom, receivablesFrom } from './books-server';

/**
 * The two reads that turned the books screen's receivables tab back on.
 *
 * Both halves of it were hidden on a live console: the ageing buckets and the
 * age column had no source, and the expense budget was a 52M so'm constant
 * printed over whatever month happened to be drawn.
 */
describe('receivablesFrom', () => {
  const today = new Date('2026-08-20T12:00:00Z');

  it('ages a debt from the day the money still owed was charged', () => {
    const screen = receivablesFrom(
      [
        {
          customer_id: 7,
          name: 'Anvar Qodirov',
          phone: '+998 90 331 20 14',
          credit_limit: 500_000_000,
          balance: 418_000_000,
          oldest_unsettled_at: '2026-07-21T13:00:00+05:00',
        },
      ],
      today,
    );

    expect(screen.live).toBe(true);
    expect(screen.rows[0]).toMatchObject({
      id: '7',
      customer: 'Anvar Qodirov',
      ageDays: 30,
      amount: 418_000_000,
      limit: 500_000_000,
    });
  });

  it('leaves out a guest holding a deposit', () => {
    // A negative balance is money the restaurant owes, and putting that name on
    // a debtors' list is how a collections call gets made to the wrong person.
    const screen = receivablesFrom(
      [{ customer_id: 8, name: 'Oldindan', phone: null, credit_limit: 0, balance: -300_000 }],
      today,
    );

    expect(screen.rows).toEqual([]);
  });

  it('has a word for "no ceiling agreed", and it is not zero so’m', () => {
    const screen = receivablesFrom(
      [{ customer_id: 9, name: 'Kompaniya', phone: null, credit_limit: 0, balance: 900_000 }],
      today,
    );

    expect(screen.rows[0].limit).toBeNull();
    expect(screen.rows[0].phone).toBe('—');
  });

  it('reads a missing age as today rather than inventing one', () => {
    // Absent means the read did not compute it. Zero lands in the calmest
    // bucket, which is the right way to be wrong — an invented 90 puts a good
    // customer in the red column.
    const screen = receivablesFrom(
      [{ customer_id: 10, name: 'Yangi', phone: null, credit_limit: 0, balance: 100 }],
      today,
    );

    expect(screen.rows[0].ageDays).toBe(0);
  });

  it('falls back to the fixture only when the read did not answer', () => {
    expect(receivablesFrom(undefined, today).live).toBe(false);
    // An empty book is an answer — a restaurant nobody owes anything — and the
    // tab draws its empty state rather than the design's three debtors.
    expect(receivablesFrom([], today)).toEqual({ rows: [], live: true });
  });
});

describe('budgetFrom', () => {
  it('reads the plan off the restaurant’s own settings document', () => {
    expect(
      budgetFrom({ data: { settings: { targets: { expense_monthly_tiyin: 5_200_000_000 } } } }),
    ).toBe(5_200_000_000);
  });

  it('treats zero and absent alike — nobody has set one', () => {
    // A budget of nothing would report every so'm as a hundred per cent
    // overspend on a restaurant that never opened the settings screen.
    expect(
      budgetFrom({ data: { settings: { targets: { expense_monthly_tiyin: 0 } } } }),
    ).toBeNull();
    expect(budgetFrom({ data: { settings: {} } })).toBeNull();
    expect(budgetFrom(null)).toBeNull();
  });
});
