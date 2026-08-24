import { describe, expect, it } from 'vitest';

import { trackedOrderFrom, type TrackedOrderPayload } from './order';

/**
 * The clock on the tracking card, and why every case below is a *pair*.
 *
 * `20:15+05:00` on its own renders `20:15` through `new Date(iso).getHours()`
 * as well — on the Asia/Tashkent boxes this platform is written on the
 * conversion is the identity, so a single stamp asserts nothing and a broken
 * read stayed green for months. Two stamps naming the same wall clock with
 * different offsets are two different instants: no zone can convert both of
 * them to `20:15`, so the pair fails wherever the suite is run — the machine's
 * own zone included.
 */

function payload(over: Partial<TrackedOrderPayload> = {}): TrackedOrderPayload {
  return {
    number: '4471',
    status: 'enroute',
    channel: 'delivery',
    branch: { id: 3, name: 'Chilonzor' },
    total: 11_200_000,
    lines: [{ menu_item_id: 41, title: 'Osh', quantity: 1, unit_price: 4_800_000 }],
    ...over,
  };
}

describe('the promised time', () => {
  it('prints the hour the kitchen promised, whatever offset it arrived with', () => {
    for (const iso of [
      '2026-08-27T20:15:00+05:00',
      '2026-08-27T20:15:00+03:00',
      '2026-08-27T20:15:00Z',
    ]) {
      expect(trackedOrderFrom(payload({ promised_at: iso }))?.eta).toBe('20:15');
    }
  });

  it('keeps a small-hours promise on its own date', () => {
    /*
     * The half that is worse than a wrong time. Converted five hours west,
     * `00:30` becomes `19:30` on the evening before — the card would tell a
     * guest their dinner was promised hours before they ordered it.
     */
    for (const iso of ['2026-08-28T00:30:00+05:00', '2026-08-28T00:30:00+03:00']) {
      expect(trackedOrderFrom(payload({ promised_at: iso }))?.eta).toBe('00:30');
    }
  });

  it('says nothing rather than a dash when there is no readable promise', () => {
    // `eta` is printed raw at 4xl on the card, so the empty string is what the
    // screen draws as "no time given". A caller that wanted an em dash would
    // put one there itself.
    expect(trackedOrderFrom(payload())?.eta).toBe('');
    expect(trackedOrderFrom(payload({ promised_at: null }))?.eta).toBe('');
    expect(trackedOrderFrom(payload({ promised_at: 'soon' }))?.eta).toBe('');
  });
});

describe('the rungs already reached', () => {
  const rungs = (offset: string): Record<string, string> => ({
    placed: `2026-08-27T19:42:00${offset}`,
    cooking: `2026-08-27T19:44:00${offset}`,
    enroute: `2026-08-27T20:03:00${offset}`,
  });

  it('stamps each rung with the venue clock, not the zone the reader keeps', () => {
    const written = { accepted: '19:42', cooking: '19:44', enroute: '20:03' };

    expect(trackedOrderFrom(payload({ reached_at: rungs('+05:00') }))?.times).toEqual(written);
    expect(trackedOrderFrom(payload({ reached_at: rungs('+03:00') }))?.times).toEqual(written);
  });

  it('leaves an unreadable rung empty and drops one with no stamp at all', () => {
    const times = trackedOrderFrom(
      payload({ reached_at: { placed: 'whenever', cooking: '' } }),
    )?.times;

    // Present but blank, and absent, are different answers: the first means the
    // rung was reached at a time nobody can read, the second that it has not
    // been reached, and the timeline draws them differently.
    expect(times).toEqual({ accepted: '' });
  });

  it('lets the first stamp for a rung stand', () => {
    // `placed` and `accepted` both land on the "accepted" rung. The guest saw
    // something happen when the order went in, not when a manager confirmed it.
    const times = trackedOrderFrom(
      payload({
        reached_at: {
          placed: '2026-08-27T19:42:00+05:00',
          accepted: '2026-08-27T19:51:00+05:00',
        },
      }),
    )?.times;

    expect(times).toEqual({ accepted: '19:42' });
  });
});
