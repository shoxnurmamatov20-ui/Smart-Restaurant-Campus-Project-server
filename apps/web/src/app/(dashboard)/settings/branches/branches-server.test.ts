import { describe, expect, it } from 'vitest';

import { labourFrom } from './branches-server';
import { steppedTarget } from './target-steps';

/**
 * The labour curve, and the two facts that look identical in the data.
 *
 * A venue with no attendance and a venue whose staff module cannot answer both
 * come back as no hours, and neither may be drawn as a flat line of 0% along
 * the bottom — that reads as a restaurant that traded with nobody at work,
 * under a caption telling a manager to cut shifts.
 */
describe('labourFrom', () => {
  it('keeps only the hours somebody was actually at work', () => {
    const curve = labourFrom({
      has_labour: true,
      labour_percent: 26.1,
      hours: [
        { hour: 9, labour_tiyin: 0, revenue_tiyin: 0, labour_percent: null },
        { hour: 14, labour_tiyin: 6_000_000, revenue_tiyin: 20_000_000, labour_percent: 30 },
        { hour: 15, labour_tiyin: 6_000_000, revenue_tiyin: 0, labour_percent: null },
      ],
    });

    // A venue that opens at eleven should draw a chart that starts at eleven.
    expect(curve?.hours.map((hour) => hour.hour)).toEqual([14, 15]);
    expect(curve?.sharePercent).toBe(26.1);
  });

  it('counts an hour as overstaffed at the threshold its own bars are coloured at', () => {
    const curve = labourFrom({
      has_labour: true,
      labour_percent: 40,
      hours: [
        { hour: 10, labour_tiyin: 5_000_000, revenue_tiyin: 10_000_000, labour_percent: 50 },
        { hour: 11, labour_tiyin: 5_000_000, revenue_tiyin: 25_000_000, labour_percent: 20 },
        // No takings: the ratio is undefined, not infinite, and an hour with no
        // percentage is not an hour anybody can call overstaffed.
        { hour: 12, labour_tiyin: 5_000_000, revenue_tiyin: 0, labour_percent: null },
      ],
    });

    expect(curve?.overstaffed).toBe(1);
  });

  it('draws nothing when the module that owns attendance did not answer', () => {
    expect(labourFrom({ has_labour: false, labour_percent: null, hours: [] })).toBeNull();
    expect(labourFrom(undefined)).toBeNull();
  });

  it('draws nothing for a week in which nobody clocked in', () => {
    expect(
      labourFrom({
        has_labour: true,
        labour_percent: null,
        hours: [{ hour: 13, labour_tiyin: 0, revenue_tiyin: 4_000_000, labour_percent: null }],
      }),
    ).toBeNull();
  });
});

describe('steppedTarget', () => {
  it('moves a million so’m at a time, which is what the figure prints in', () => {
    expect(steppedTarget(1_800_000_000, 1)).toBe(1_900_000_000);
    expect(steppedTarget(1_800_000_000, -1)).toBe(1_700_000_000);
  });

  it('stops at zero rather than going negative', () => {
    // Zero is a real state — nobody has set a target — and is how a manager
    // clears one set by mistake. Below it is a bug somebody has to explain.
    expect(steppedTarget(0, -1)).toBe(0);
  });

  it('stops at what the settings schema will accept', () => {
    expect(steppedTarget(100_000_000_000, 1)).toBe(100_000_000_000);
  });
});
