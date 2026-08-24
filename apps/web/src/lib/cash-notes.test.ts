import { describe, expect, it } from 'vitest';

import { FALLBACK_LADDER, ladderFrom, TIYIN_PER_SOM, UZS_NOTES } from './cash-notes';

/**
 * The ladder decides what a cashier can count, and a note missing from it is a
 * note that goes uncounted. That is not a display bug: the float comes out
 * short, the drawer reads short for the rest of the evening, and the variance
 * lands on the person who counted it.
 */
describe('the notes a drawer is counted in', () => {
  it('carries all eight of the notes in circulation', () => {
    // The regression this file exists for: the count screen shipped with six.
    // 20 000 and 2 000 were missing, and a cashier holding either had nowhere
    // to put it.
    expect(UZS_NOTES.map((note) => note / TIYIN_PER_SOM)).toEqual([
      200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000,
    ]);
  });

  it('holds the notes in tiyin, largest first', () => {
    // Tiyin, like every other amount in this app. A ladder in so'm would be one
    // forgotten multiplication away from a drawer a hundred times too small.
    expect(UZS_NOTES[0]).toBe(20_000_000);
    expect([...UZS_NOTES].sort((a, b) => b - a)).toEqual([...UZS_NOTES]);
  });

  it('rounds to the smallest note and no finer', () => {
    // Cash is rounded so the drawer can pay in notes that exist. A step below
    // the smallest note rounds a bill to a figure nobody can hand over.
    expect(FALLBACK_LADDER.roundingStep).toBe(Math.min(...UZS_NOTES));
  });
});

describe('reading the ladder the API sends', () => {
  it('takes the server list over the built-in one', () => {
    const ladder = ladderFrom({
      data: { denominations: [500_000, 5_000_000, 1_000_000], rounding_step: 500_000 },
    });

    expect(ladder.notes).toEqual([5_000_000, 1_000_000, 500_000]);
    expect(ladder.roundingStep).toBe(500_000);
    expect(ladder.live).toBe(true);
  });

  it('falls back when there is no answer, rather than showing no rows', () => {
    // A till has to open when the network does not. A count screen with no rows
    // on it is a till that cannot be opened at all.
    for (const body of [null, {}, { data: {} }, { data: { denominations: [] } }]) {
      expect(ladderFrom(body)).toEqual(FALLBACK_LADDER);
      expect(ladderFrom(body).live).toBe(false);
    }
  });

  it('drops anything that is not a countable note', () => {
    // Not defensiveness for its own sake: a wrong denomination is silent. The
    // count just comes out wrong and the cashier gets asked why.
    const ladder = ladderFrom({
      data: { denominations: [1_000_000, 0, -500, 12.5, '2000', null, 500_000] },
    } as never);

    expect(ladder.notes).toEqual([1_000_000, 500_000]);
  });

  it('falls back to the smallest note when the server names no step', () => {
    const ladder = ladderFrom({ data: { denominations: [1_000_000, 200_000] } });

    expect(ladder.roundingStep).toBe(200_000);
  });
});
