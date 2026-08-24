import { describe, expect, it } from 'vitest';

import { deliverableFrom, haversineKm, type DeliveryZone } from './geo';

/**
 * The client half of the delivery boundary.
 *
 * The server holds the same rule in
 * `Modules/Marketplace/app/Services/DeliveryReach.php` and enforces it at
 * checkout; this module answers earlier, in an address sheet. Two copies of a
 * distance formula is how a phone says "yes" to an address the checkout then
 * refuses — so the numbers below are the ones the PHP produces, and this file is
 * what catches the two drifting apart.
 */

/** Tashkent, roughly the middle of Chilonzor. */
const VENUE = { latitude: 41.311081, longitude: 69.240562 };

const zone = (over: Partial<DeliveryZone> = {}): DeliveryZone => ({
  label: 'Markaz',
  radiusKm: 3,
  latitude: VENUE.latitude,
  longitude: VENUE.longitude,
  feeTiyin: 1_200_000,
  minOrderTiyin: 0,
  ...over,
});

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm(VENUE, VENUE)).toBe(0);
  });

  it('measures a degree of latitude at roughly 111 km', () => {
    // The one figure on the earth that does not depend on where you are, which
    // is what makes it the right calibration for a spherical formula.
    const km = haversineKm(VENUE, { latitude: VENUE.latitude + 1, longitude: VENUE.longitude });

    expect(km).toBeGreaterThan(111.1);
    expect(km).toBeLessThan(111.3);
  });

  it('shrinks a degree of longitude by the cosine of the latitude', () => {
    // At 41° north a degree of longitude is about three quarters of one of
    // latitude. An equirectangular approximation gets this wrong, and the error
    // lands on exactly the addresses at the edge of a zone.
    const km = haversineKm(VENUE, { latitude: VENUE.latitude, longitude: VENUE.longitude + 1 });

    expect(km).toBeGreaterThan(83);
    expect(km).toBeLessThan(84);
  });

  it('is symmetric', () => {
    const there = { latitude: 41.35, longitude: 69.28 };

    expect(haversineKm(VENUE, there)).toBeCloseTo(haversineKm(there, VENUE), 9);
  });
});

describe('deliverableFrom', () => {
  it('covers an address inside the circle', () => {
    const answer = deliverableFrom([zone()], { latitude: 41.32, longitude: 69.245 });

    expect(answer.deliverable).toBe(true);
    if (answer.deliverable) {
      expect(answer.zone.label).toBe('Markaz');
      expect(answer.distanceKm).toBeLessThan(3);
    }
  });

  it('refuses an address outside every circle and says how far', () => {
    const answer = deliverableFrom([zone()], { latitude: 41.5, longitude: 69.240562 });

    expect(answer.deliverable).toBe(false);
    if (!answer.deliverable) {
      expect(answer.reason).toBe('outside');
      // The distance is reported so the sheet can say "12 km away" rather than
      // just "no" — a guest with two saved addresses needs to know which.
      expect(answer.distanceKm).not.toBeNull();
      expect(answer.distanceKm ?? 0).toBeGreaterThan(20);
    }
  });

  it('answers unknown — never a refusal — when nobody knows where the address is', () => {
    // Every address saved before the app could ask for a fix is in this state,
    // and refusing them would lose orders that would have been fine.
    const answer = deliverableFrom([zone()], null);

    expect(answer.deliverable).toBe(false);
    if (!answer.deliverable) {
      expect(answer.reason).toBe('unknown');
      expect(answer.distanceKm).toBeNull();
    }
  });

  it('answers unknown when the shop has drawn no boundary at all', () => {
    // Which is every storefront on the day it opens. "No zones" is not
    // "nowhere".
    const answer = deliverableFrom([], { latitude: 41.32, longitude: 69.245 });

    expect(answer.deliverable).toBe(false);
    if (!answer.deliverable) {
      expect(answer.reason).toBe('unknown');
    }
  });

  it('picks the nearest covering zone rather than the first one listed', () => {
    // A cheap inner circle and a dearer outer one both apply near the venue,
    // and the order a merchant happened to type them in must not overcharge.
    const outer = zone({ label: 'Chekka', radiusKm: 9, feeTiyin: 2_400_000 });
    const inner = zone({ label: 'Markaz', radiusKm: 3, feeTiyin: 900_000 });

    const answer = deliverableFrom([outer, inner], { latitude: 41.315, longitude: 69.242 });

    expect(answer.deliverable).toBe(true);
    if (answer.deliverable) {
      expect(answer.zone.label).toBe('Markaz');
      expect(answer.zone.feeTiyin).toBe(900_000);
    }
  });

  it('falls through to the outer zone when the inner one does not reach', () => {
    const outer = zone({ label: 'Chekka', radiusKm: 9, feeTiyin: 2_400_000 });
    const inner = zone({ label: 'Markaz', radiusKm: 3, feeTiyin: 900_000 });

    const answer = deliverableFrom([outer, inner], { latitude: 41.36, longitude: 69.242 });

    expect(answer.deliverable).toBe(true);
    if (answer.deliverable) {
      expect(answer.zone.label).toBe('Chekka');
    }
  });
});
