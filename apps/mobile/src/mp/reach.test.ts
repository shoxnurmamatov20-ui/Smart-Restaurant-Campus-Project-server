import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  Failure: class Failure extends Error {},
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
vi.mock('@/lib/push', () => ({ registerForPush: vi.fn() }));
// The `@/` alias is a bundler's, not Node's, so every aliased import this
// module reaches has to be stubbed — the same list `crew/queue.test.ts` keeps.
// None of it is exercised here: the functions under test are pure.
vi.mock('@/lib/live', () => ({ useLive: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  KEYS: { mpSession: 'mp-session' },
  erase: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));

import {
  DEMO_STORES,
  demoAddresses,
  notifyFrom,
  reachOf,
  zoneFrom,
  type DeliveryZone,
  type MpAddress,
} from './live';

/**
 * Whether a courier will come, answered before the guest builds a basket.
 *
 * The three states are not decoration. Two of them close a row and one of them
 * must not, and getting that wrong costs an order either way: refuse an address
 * nobody has located and a regular customer is told their own home is out of
 * range; accept one that is plainly sixteen kilometres out and the refusal
 * arrives at checkout, which is the one moment an order is abandoned.
 *
 * The arithmetic itself belongs to `@restaurant/surfaces/mp/geo` and is tested
 * there. What is tested here is the mapping on top of it — which state each
 * answer becomes, and that the sample the design draws still draws the same way
 * now that it goes through real coordinates instead of a boolean.
 */

/** The centre both demo circles share — Tashkent, near Amir Temur square. */
const CENTRE = { latitude: 41.3111, longitude: 69.2797 };

const zones: readonly DeliveryZone[] = [
  { label: 'inner', radiusKm: 3, ...CENTRE, feeTiyin: 1_200_000, minOrderTiyin: 0 },
  { label: 'outer', radiusKm: 6, ...CENTRE, feeTiyin: 1_800_000, minOrderTiyin: 0 },
];

const at = (latitude: number | null, longitude: number | null): MpAddress => ({
  key: 'x',
  label: 'X',
  address: 'X',
  note: null,
  latitude,
  longitude,
  isDefault: false,
});

describe('reachOf', () => {
  it('says nothing at all before a shop has been chosen', () => {
    // No zones is not "nowhere". It is nobody having asked yet — the state the
    // home header opens in — and the sheet draws silence rather than a refusal.
    expect(reachOf([], at(41.295, 69.26))).toEqual({ state: 'unasked' });
  });

  it('takes the nearest covering circle, not the first one listed', () => {
    const reach = reachOf(zones, at(41.295, 69.26));

    expect(reach.state).toBe('ok');
    // 2.4 km is inside both circles, and the inner one is what it costs. Taking
    // the first match would bill an inner-ring address at the outer ring's fee
    // purely because of how a settings screen happened to order the rows.
    expect(reach.state === 'ok' && reach.zone.label).toBe('inner');
    expect(reach.state === 'ok' && Math.round(reach.distanceKm * 10) / 10).toBe(2.4);
  });

  it('falls to the outer circle when only that one covers it', () => {
    const reach = reachOf(zones, at(41.3555, 69.295));

    expect(reach.state === 'ok' && reach.zone.label).toBe('outer');
    expect(reach.state === 'ok' && Math.round(reach.distanceKm * 10) / 10).toBe(5.1);
  });

  it('refuses an address outside every circle, and keeps the distance', () => {
    const reach = reachOf(zones, at(41.22, 69.13));

    expect(reach.state).toBe('outside');
    // The nearest edge is still worth carrying: "sixteen kilometres" is what
    // turns a refusal into something a guest understands rather than argues with.
    expect(reach.state === 'outside' && (reach.distanceKm ?? 0) > 6).toBe(true);
  });

  it('does NOT refuse an address that simply has no coordinates', () => {
    // The whole point of the third state. An address saved before the map
    // existed is one the courier has been to a dozen times; nobody knowing
    // where it is is not the same as knowing it is too far.
    expect(reachOf(zones, at(null, null))).toEqual({ state: 'unmapped' });
    expect(reachOf(zones, at(41.295, null))).toEqual({ state: 'unmapped' });
  });
});

describe('the sample book', () => {
  /*
   * The design draws three saved addresses and greys the third one out. That
   * row used to be a boolean typed into the fixture, which meant the sheet's
   * most important state was the one piece of it no arithmetic had produced.
   * These assertions are what stop it going back to being decoration.
   */
  const book = demoAddresses('uz');
  const demoZones = DEMO_STORES[0]?.zones ?? [];

  it('reaches home and work, and refuses the parents', () => {
    const states = book.map((entry) => reachOf(demoZones, entry).state);

    expect(states).toEqual(['ok', 'ok', 'outside']);
  });

  it('charges the two reachable ones what the fixture always said they cost', () => {
    // `SAVED_ADDRESSES` captions them "2.4 km · 12 000" and "5.1 km · 18 000".
    // Those two numbers now come out of the distance formula rather than out of
    // a string, which is the only way the caption and the bill cannot drift.
    const fees = book
      .map((entry) => reachOf(demoZones, entry))
      .filter((reach) => reach.state === 'ok')
      .map((reach) => (reach.state === 'ok' ? reach.zone.feeTiyin : 0));

    expect(fees).toEqual([1_200_000, 1_800_000]);
  });
});

describe('zoneFrom', () => {
  it('renames without converting', () => {
    // Kilometres both sides. A unit conversion hidden in a field mapping is how
    // a five-kilometre zone quietly becomes five metres.
    expect(
      zoneFrom({
        label: 'Markaz',
        radius_km: 5,
        latitude: 41.3,
        longitude: 69.2,
        fee_tiyin: 1_500_000,
        min_order_tiyin: 5_000_000,
      }),
    ).toEqual({
      label: 'Markaz',
      radiusKm: 5,
      latitude: 41.3,
      longitude: 69.2,
      feeTiyin: 1_500_000,
      minOrderTiyin: 5_000_000,
    });
  });
});

describe('notifyFrom', () => {
  it('reads a missing preference as on', () => {
    // The column is nullable, so every key is missing on a guest who has never
    // opened the sheet. Defaulting to off would draw four switches claiming the
    // app will not tell them their order is on the way.
    expect(notifyFrom(null)).toEqual({
      orders: true,
      promos: true,
      delivery: true,
      newsletter: true,
    });
  });

  it('keeps an explicit false, which is the whole point of storing them', () => {
    expect(notifyFrom({ promos: false, newsletter: false })).toEqual({
      orders: true,
      promos: false,
      delivery: true,
      newsletter: false,
    });
  });
});
