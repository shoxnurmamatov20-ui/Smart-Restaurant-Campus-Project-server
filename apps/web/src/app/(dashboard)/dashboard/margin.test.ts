import { describe, expect, it } from 'vitest';

import { marginOf } from './margin';
import { getOverview } from './overview-data';

describe('marginOf', () => {
  it('reads the design figure off the fixture, because the fixture is where it came from', async () => {
    const overview = await getOverview(null, 'today');

    expect(marginOf(overview.kpis)).toBe(61.1);
  });

  it('is nothing on a day with no revenue, or when the server would not vouch for profit', async () => {
    const { kpis } = await getOverview(null, 'today');

    expect(
      marginOf(kpis.map((kpi) => (kpi.key === 'revenue' ? { ...kpi, value: 0 } : kpi))),
    ).toBeNull();
    expect(
      marginOf(kpis.map((kpi) => (kpi.key === 'gross_profit' ? { ...kpi, value: null } : kpi))),
    ).toBeNull();
  });
});
