import { describe, expect, it } from 'vitest';

import { REPORT_CARDS, type ReportId } from './reports-data';
import { exportTarget } from './reports-server';

/**
 * Which report a card asks the API for.
 *
 * Worth a test because the two vocabularies do not quite line up: the design's
 * fifth card is `cash` and the API calls that report `cashflow`, and a file
 * requested under the wrong name is not a wrong file — it is a 400 on the one
 * button whose whole job is to produce something.
 */
describe('exportTarget', () => {
  it('keeps the one name the design and the API disagree about', () => {
    expect(exportTarget('cash', 'month')).toEqual({ kind: 'cashflow', period: 'month' });
  });

  it('asks for a month when the reader picked a quarter', () => {
    // Every figure in this module is windowed on a fixed ladder of one, seven
    // and thirty days. A month is the honest nearest answer; the button stays
    // because the design draws four.
    expect(exportTarget('waiters', 'quarter').period).toBe('month');
  });

  it('names a kind for every card that carries an id', () => {
    // A card with a Run button and no kind behind it is a viewer that 400s.
    for (const card of REPORT_CARDS) {
      if (card.id === undefined) continue;

      expect(exportTarget(card.id as ReportId, 'month').kind).not.toBe('');
    }
  });
});
