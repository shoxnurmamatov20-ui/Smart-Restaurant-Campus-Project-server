import { describe, expect, it } from 'vitest';

import { ledeText } from './lede';
import type { Lede } from './overview-data';

/** A `t()` that echoes the key and its arguments, so the wiring is what is tested. */
const t = (key: string, values?: Record<string, string | number>): string =>
  values ? `${key}(${Object.values(values).join(',')})` : key;

const base: Lede = { branch: 'Chilonzor', period: 'today', revenueDeltaPercent: 12.44, issues: 2 };

describe('ledeText', () => {
  it('words a comparison and a count from facts', () => {
    expect(ledeText(base, t)).toBe('ledeAhead(Chilonzor,againstToday,12.4) ledeIssues(2)');
  });

  it('says behind, level, and picks the period it is against', () => {
    expect(ledeText({ ...base, period: 'week', revenueDeltaPercent: -3.06 }, t)).toBe(
      'ledeBehind(Chilonzor,againstWeek,3.1) ledeIssues(2)',
    );
    expect(ledeText({ ...base, period: 'month', revenueDeltaPercent: 0.04 }, t)).toBe(
      'ledeLevel(Chilonzor,againstMonth) ledeIssues(2)',
    );
  });

  it('drops the comparison the server would not vouch for', () => {
    expect(ledeText({ ...base, revenueDeltaPercent: null, issues: 0 }, t)).toBe('ledeIssues(0)');
  });

  it('keeps the design sentence for the fixture console', () => {
    expect(ledeText(null, t)).toBe('lede');
  });
});
