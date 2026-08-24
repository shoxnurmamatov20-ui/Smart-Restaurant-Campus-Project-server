/**
 * How far away a thing is, and whether a courier will go there.
 *
 * Drawn twice — the web checkout and the native address sheet — so the answer
 * lives once. Two copies of a distance formula is how a phone says "yes" to an
 * address the checkout then refuses, which is the one moment an order is
 * abandoned.
 *
 * ---------------------------------------------------------------------------
 * Radius rather than a polygon, and that is a decision
 *
 * A drawn delivery area is the honest shape of one, and drawing it needs a
 * basemap, a geocoder and a spatial store — three dependencies this build does
 * not take (`TODO(integration): needs MAP_API_KEY — see docs/GO-LIVE.md`). A circle round the venue
 * answers the same question badly at the edges and well everywhere else, and
 * "badly at the edges" is a courier ringing to say they cannot find the block.
 *
 * The server holds the same rule and enforces it at checkout — see
 * `Modules/Marketplace/app/Services/DeliveryReach.php`, which is where the
 * refusal actually happens. This module is the *early* answer, so the guest is
 * told before they have built a basket.
 */

/** A point on the earth, in ordinary degrees. */
export type GeoPoint = { latitude: number; longitude: number };

/** One circle a storefront delivers inside. */
export type DeliveryZone = {
  label: string;
  radiusKm: number;
  latitude: number;
  longitude: number;
  feeTiyin: number;
  minOrderTiyin: number;
};

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the equirectangular approximation: the cheap version is
 * out by a few percent, and a few percent of a five-kilometre radius is three
 * hundred metres of addresses that get the wrong answer.
 */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type Reach =
  | { deliverable: true; zone: DeliveryZone; distanceKm: number }
  | { deliverable: false; reason: 'outside' | 'unknown'; distanceKm: number | null };

/**
 * Which zone covers this address, if any.
 *
 * The TIGHTEST covering zone wins — smallest radius, not shortest distance —
 * and the difference is the whole rule. A storefront's zones are usually
 * concentric: a cheap circle round the door and a dearer ring beyond it, both
 * centred on the venue. Every point is exactly as far from one centre as from
 * the other, so "nearest zone" picks whichever the merchant happened to type
 * first, and a guest across the street pays the outer-ring fee. Distance only
 * breaks a tie between two circles of the same size.
 *
 * An address with no coordinates answers `unknown` and NOT `false`. A guest
 * whose saved address predates the map is not outside the zone; nobody knows,
 * and refusing them on that basis loses an order that would have been fine.
 * The server makes the same distinction, in `DeliveryReach`.
 */
export function deliverableFrom(zones: readonly DeliveryZone[], point: GeoPoint | null): Reach {
  if (zones.length === 0) {
    // No zones declared at all is a storefront that has not drawn a boundary,
    // which is "everywhere" rather than "nowhere" — the state every storefront
    // is in on the day it opens.
    return { deliverable: false, reason: 'unknown', distanceKm: null };
  }

  if (point === null) {
    return { deliverable: false, reason: 'unknown', distanceKm: null };
  }

  let nearest: number | null = null;
  let covering: { zone: DeliveryZone; distanceKm: number } | null = null;

  for (const zone of zones) {
    const distanceKm = haversineKm(zone, point);

    if (nearest === null || distanceKm < nearest) {
      nearest = distanceKm;
    }

    if (distanceKm > zone.radiusKm) {
      continue;
    }

    const tighter =
      covering === null ||
      zone.radiusKm < covering.zone.radiusKm ||
      (zone.radiusKm === covering.zone.radiusKm && distanceKm < covering.distanceKm);

    if (tighter) {
      covering = { zone, distanceKm };
    }
  }

  if (covering !== null) {
    return { deliverable: true, zone: covering.zone, distanceKm: covering.distanceKm };
  }

  return { deliverable: false, reason: 'outside', distanceKm: nearest };
}
