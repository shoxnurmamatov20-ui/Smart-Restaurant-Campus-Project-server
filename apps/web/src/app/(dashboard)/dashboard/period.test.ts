import { describe, expect, it } from 'vitest';

import { getAccountantOverview } from './accountant-data';
import { getCashierOverview } from './cashier-data';
import { getOverview, isPeriod, PERIODS, scaleFor } from './overview-data';
import { getWarehouseOverview } from './warehouse-data';

/**
 * The period toggle, against the mistake it is easy to make.
 *
 * Scaling a dashboard by a period is three lines and one trap: **ratios must
 * not scale**. A margin, a waste percentage and a rail's attainment are the
 * same number over a day and over a month, and multiplying one by twenty-seven
 * puts "444% margin" on an owner's screen. Every assertion below is about that
 * distinction rather than about the arithmetic.
 *
 * The second trap is the drawer: a cashier's till holds what it holds *now*,
 * and a week of takings multiplied into it is a figure no count can match.
 */
describe('the period toggle', () => {
  it('accepts only the three periods the design names', () => {
    expect(PERIODS).toEqual(['today', 'week', 'month']);

    for (const period of PERIODS) expect(isPeriod(period)).toBe(true);

    // Anything off a URL. A mistyped parameter falls back rather than 404s.
    expect(isPeriod('year')).toBe(false);
    expect(isPeriod('')).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
  });

  it('is not a flat multiple of a day', () => {
    // A restaurant does not trade seven identical Tuesdays: the weekend carries
    // the week. A toggle that multiplied by 7 would draw a curve no
    // restaurateur recognises.
    expect(scaleFor('today')).toBe(1);
    expect(scaleFor('week')).toBeLessThan(7);
    expect(scaleFor('month')).toBeLessThan(31);
    expect(scaleFor('month')).toBeGreaterThan(scaleFor('week'));
  });

  it('scales the amounts on the owner overview', async () => {
    const today = await getOverview(null, 'today');
    const month = await getOverview(null, 'month');

    const revenueToday = today.kpis.find((kpi) => kpi.key === 'revenue')!;
    const revenueMonth = month.kpis.find((kpi) => kpi.key === 'revenue')!;

    expect(revenueMonth.value).toBeGreaterThan(revenueToday.value ?? Number.NaN);
  });

  it('leaves every ratio alone', async () => {
    const today = await getOverview(null, 'today');
    const month = await getOverview(null, 'month');

    // Attainment is a fraction of a target, and the target moves with the
    // period. A scaled attainment is a rail past its own end.
    for (const [index, kpi] of month.kpis.entries()) {
      expect(kpi.attainment, `${kpi.key} attainment moved`).toBe(today.kpis[index]?.attainment);
    }

    const accountantToday = await getAccountantOverview('today');
    const accountantMonth = await getAccountantOverview('month');

    expect(accountantMonth.netMargin).toBe(accountantToday.netMargin);

    const warehouseToday = await getWarehouseOverview(null, 'today');
    const warehouseMonth = await getWarehouseOverview(null, 'month');

    expect(warehouseMonth.wastePercent).toBe(warehouseToday.wastePercent);
    // What is on the shelf is not a period figure either.
    expect(warehouseMonth.stock).toEqual(warehouseToday.stock);
  });

  it('never scales the cash drawer', async () => {
    const today = await getCashierOverview('today');
    const week = await getCashierOverview('week');

    // The drawer is what is physically in front of the cashier. A week of
    // takings multiplied into it is a number no count could ever match.
    expect(week.drawer).toBe(today.drawer);
    expect(week.openingFloat).toBe(today.openingFloat);

    // The payment count *is* a period figure and does move. The fixture always
    // carries one, which is what makes the comparison meaningful — a live
    // console answers `null` where the server did not.
    expect(week.payments ?? 0).toBeGreaterThan(today.payments ?? 0);
  });
});
