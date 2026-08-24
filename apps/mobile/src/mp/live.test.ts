import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  Failure: class Failure extends Error {},
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
vi.mock('@/lib/push', () => ({ registerForPush: vi.fn() }));
// The `@/` alias is a bundler's, not Node's, so every aliased import this module
// reaches has to be stubbed — the same list `reach.test.ts` keeps. None of it is
// exercised: the two functions under test are pure and take their clock as an
// argument.
vi.mock('@/lib/live', () => ({ useLive: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  KEYS: { mpSession: 'mp-session' },
  erase: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));

import { clock, trackFrom, type ApiOrder } from './live';

/**
 * The tracking ladder's clock, and why every case below is a *pair*.
 *
 * `19:34+05:00` renders `19:34` through `new Date(iso).getHours()` as well — on
 * the Asia/Tashkent phones and boxes this app is written on the conversion is
 * the identity, so a single stamp asserts nothing. That is how the wrong read
 * survived here wearing a docblock that defended it. Two stamps naming the same
 * wall clock at different offsets are two different instants: no zone converts
 * both of them to 19:34, so the pair fails wherever the suite is run — CI's UTC
 * and the author's Tashkent alike.
 *
 * The last case is the other half of the same rule. Minutes remaining are a gap
 * between two instants and carry no zone at all, so the pair that must render
 * one label must also produce two different countdowns. A "fix" that pushed the
 * written reading into the arithmetic would fail on it.
 */

const order = (over: Partial<ApiOrder> = {}): ApiOrder => ({
  number: 'MP-8421',
  state: 'courier_assigned',
  rung: 'courier',
  store: { slug: 'osh', name: 'Osh Xona', initials: 'OX', tint: '#B54A2A' },
  subtotal_tiyin: 11_200_000,
  discount_tiyin: 0,
  service_fee_tiyin: 0,
  service_percent: 0,
  delivery_fee_tiyin: 1_200_000,
  total_tiyin: 12_400_000,
  promo_code: null,
  pay_rail: 'click',
  paid_at: null,
  address: 'Chilonzor 12',
  address_note: null,
  eta_at: null,
  eta_minutes: null,
  courier: null,
  can_cancel: false,
  can_rate: false,
  rating: null,
  stamps: {},
  cancel_reason: null,
  reject_reason: null,
  created_at: null,
  ...over,
});

describe('one stamp', () => {
  it('prints the hour the venue wrote, whatever offset it arrived with', () => {
    for (const iso of [
      '2026-08-27T19:34:05+05:00',
      '2026-08-27T19:34:05+03:00',
      '2026-08-27T19:34:05Z',
    ]) {
      expect(clock(iso)).toBe('19:34');
    }
  });

  it('keeps a small-hours delivery on its own date', () => {
    /*
     * The half that is worse than a wrong time. Converted five hours west,
     * 00:20 becomes 19:20 the previous evening, so the ladder shows the order
     * delivered hours before the guest placed it.
     */
    for (const iso of ['2026-08-28T00:20:00+05:00', '2026-08-28T00:20:00+03:00']) {
      expect(clock(iso)).toBe('00:20');
    }
  });

  it('answers null, not a dash, when there is nothing to read', () => {
    // The em dash belongs to `trackFrom`, which puts one on every rung that has
    // not happened; `Track.eta` stays null and the header draws nothing at all.
    expect(clock(null)).toBeNull();
    expect(clock(undefined)).toBeNull();
    expect(clock('')).toBeNull();
    expect(clock('soon')).toBeNull();
  });
});

describe('the tracking screen', () => {
  /** 19:04 in the dining room, 14:04 for a phone that came back from London. */
  const NOW = Date.parse('2026-08-27T14:04:00Z');

  it('draws the rungs and the promise as the venue wrote them', () => {
    for (const zone of ['+05:00', '+03:00']) {
      const track = trackFrom(
        order({
          stamps: {
            placed: `2026-08-27T19:10:00${zone}`,
            accepted: `2026-08-27T19:14:00${zone}`,
          },
          eta_at: `2026-08-27T19:34:00${zone}`,
        }),
        NOW,
      );

      expect(track.stamps).toEqual(['19:10', '19:14', '—', '—', '—']);
      expect(track.eta).toBe('19:34');
    }
  });

  it('still counts the wait as an instant, so one label can be two countdowns', () => {
    const near = trackFrom(order({ eta_at: '2026-08-27T19:34:00+05:00' }), NOW);
    const far = trackFrom(order({ eta_at: '2026-08-27T19:34:00+03:00' }), NOW);

    expect([near.eta, far.eta]).toEqual(['19:34', '19:34']);
    expect(near.minutesLeft).toBe(30);
    expect(far.minutesLeft).toBe(150);
  });
});
