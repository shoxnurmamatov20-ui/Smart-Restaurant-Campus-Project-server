<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

use Modules\Marketplace\Models\DeliveryZone;
use Modules\Marketplace\Models\Store;

/**
 * Whether anybody will actually ride to this address.
 *
 * The server half of `packages/surfaces/src/mp/geo.ts`. Both exist on purpose:
 * the client answers EARLY, in an address sheet, before a guest has built a
 * basket; this one answers at checkout, where the answer is enforceable. A rule
 * that lived only on the client is a rule a page a stranger can edit gets to
 * decide, and one that lived only here is a refusal that arrives after twenty
 * minutes of shopping.
 *
 * ---------------------------------------------------------------------------
 * Three answers, not two
 *
 * `covered`, `outside`, and `unknown` — and the third is the one that matters.
 * An address with no coordinates is not outside the zone; NOBODY KNOWS. Refusing
 * it loses an order that would have been fine, and every address saved before
 * the app could ask for a fix is in exactly that state. So `unknown` is allowed
 * through and the merchant sees it as an ordinary order.
 *
 * A storefront that has drawn no zones at all is `unknown` for the same reason:
 * the day a shop opens it has no boundary, and a boundary of nothing must mean
 * "everywhere" rather than "nowhere".
 */
final readonly class DeliveryReach
{
    /**
     * Metres of the earth, per radian, twice.
     *
     * Haversine rather than the flat approximation: the cheap version is out by
     * a few percent, and a few percent of a five-kilometre radius is three
     * hundred metres of addresses answered wrongly.
     */
    private const EARTH_RADIUS_M = 6_371_000;

    /**
     * Which zone covers a point, if any.
     *
     * The TIGHTEST covering zone wins — smallest radius, not shortest distance —
     * and the difference is the whole rule. A storefront's zones are usually
     * concentric: a cheap circle round the door and a dearer ring beyond it,
     * both centred on the venue. Every address is exactly as far from one centre
     * as from the other, so "nearest" picks whichever row the merchant happened
     * to type first and charges a guest across the street the outer-ring fee.
     * Distance only breaks a tie between two circles of the same size.
     *
     * @param  iterable<int, DeliveryZone>  $zones
     * @return array{status: 'covered'|'outside'|'unknown', zone: DeliveryZone|null, metres: int|null}
     */
    public function reach(iterable $zones, ?int $latitudeE6, ?int $longitudeE6): array
    {
        $covering = null;
        $coveringMetres = null;
        $nearest = null;
        $any = false;

        foreach ($zones as $zone) {
            $any = true;

            if ($latitudeE6 === null || $longitudeE6 === null) {
                continue;
            }

            $metres = $this->metresBetween(
                $zone->latitude_e6,
                $zone->longitude_e6,
                $latitudeE6,
                $longitudeE6,
            );

            if ($nearest === null || $metres < $nearest) {
                $nearest = $metres;
            }

            if ($metres > $zone->radius_m) {
                continue;
            }

            $tighter = $covering === null
                || $zone->radius_m < $covering->radius_m
                || ($zone->radius_m === $covering->radius_m && $metres < ($coveringMetres ?? PHP_INT_MAX));

            if ($tighter) {
                $covering = $zone;
                $coveringMetres = $metres;
            }
        }

        if (! $any) {
            return ['status' => 'unknown', 'zone' => null, 'metres' => null];
        }

        if ($latitudeE6 === null || $longitudeE6 === null) {
            return ['status' => 'unknown', 'zone' => null, 'metres' => null];
        }

        if ($covering instanceof DeliveryZone) {
            return ['status' => 'covered', 'zone' => $covering, 'metres' => $coveringMetres];
        }

        return ['status' => 'outside', 'zone' => null, 'metres' => $nearest];
    }

    /**
     * The same question against a storefront, loading its zones once.
     *
     * @return array{status: 'covered'|'outside'|'unknown', zone: DeliveryZone|null, metres: int|null}
     */
    public function reachOf(Store $store, ?int $latitudeE6, ?int $longitudeE6): array
    {
        $zones = $store->relationLoaded('zones')
            ? $store->zones
            : $store->zones()->orderBy('sort_order')->get();

        return $this->reach($zones, $latitudeE6, $longitudeE6);
    }

    /**
     * Great-circle distance in whole metres.
     *
     * Integers in, integer out — microdegrees are the unit every coordinate on
     * this platform is stored in, and a helper that took degrees would be one
     * more place a caller could divide by a million in the wrong direction.
     */
    public function metresBetween(int $fromLatE6, int $fromLngE6, int $toLatE6, int $toLngE6): int
    {
        $lat1 = deg2rad($fromLatE6 / 1_000_000);
        $lat2 = deg2rad($toLatE6 / 1_000_000);
        $dLat = $lat2 - $lat1;
        $dLng = deg2rad(($toLngE6 - $fromLngE6) / 1_000_000);

        $a = sin($dLat / 2) ** 2 + cos($lat1) * cos($lat2) * sin($dLng / 2) ** 2;

        return (int) round(self::EARTH_RADIUS_M * 2 * atan2(sqrt($a), sqrt(1 - $a)));
    }
}
