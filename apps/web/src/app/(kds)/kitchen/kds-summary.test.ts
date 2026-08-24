import { describe, expect, it } from 'vitest';

import { boardSummary } from './kds-data';
import type { Ticket } from './kds-data';

/**
 * The strip across the top of the kitchen wall.
 *
 * It was a constant (`KITCHEN_SUMMARY`) and read "7 · 8:40 · 11:02" over an
 * empty board in every restaurant. What is checked here is the property that
 * made that a defect: with nothing on the board the figures go to zero and to
 * null, and the caller draws a dash rather than a number.
 */
const ticket = (over: Partial<Ticket>): Ticket => ({
  id: 'A-1',
  table: '12',
  station: 'hot',
  waiter: '—',
  age: '0:00',
  minutes: 0,
  state: 'colNew',
  lines: [],
  ...over,
});

describe('boardSummary', () => {
  it('reports nothing at all for an empty board', () => {
    expect(boardSummary([], 1_000_000)).toEqual({
      open: 0,
      averageCook: null,
      longestWait: null,
    });
  });

  it('ignores served dockets, which are on their way off the screen', () => {
    const summary = boardSummary(
      [ticket({ minutes: 20, state: 'colServed' }), ticket({ minutes: 4, state: 'colCooking' })],
      null,
    );

    expect(summary).toEqual({ open: 1, averageCook: '4:00', longestWait: '4:00' });
  });

  it('counts from the ticket timestamps once the client clock has ticked', () => {
    const now = 1_700_000_000_000;
    const summary = boardSummary(
      [
        ticket({ since: now - 120_000, minutes: 99 }),
        ticket({ since: now - 600_000, minutes: 99 }),
      ],
      now,
    );

    // Mean of 2:00 and 10:00, and the longest of the two. `minutes` is
    // deliberately absurd to prove the timestamps win over the API's frozen
    // cook time once there is a clock to count against.
    expect(summary).toEqual({ open: 2, averageCook: '6:00', longestWait: '10:00' });
  });

  it('falls back to the elapsed minutes the API sent before the first tick', () => {
    expect(boardSummary([ticket({ since: 1, minutes: 7 })], null).averageCook).toBe('7:00');
  });

  it('formats past the hour in minutes, as the cards do', () => {
    expect(boardSummary([ticket({ minutes: 74 })], null).longestWait).toBe('74:00');
  });
});
