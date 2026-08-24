<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Marketplace\Http\Requests\SaveDeliveryZonesRequest;
use Modules\Marketplace\Http\Resources\DeliveryZoneResource;
use Modules\Marketplace\Models\Store;

/**
 * How far this shop will send a courier.
 *
 * A PUT of the whole boundary rather than four endpoints, for the same reason
 * the consumer's address book is one: a merchant editing a delivery area is
 * thinking about the shape as a whole, and a sequence of add/edit/delete calls
 * leaves the shop reachable from a ring it no longer serves for however long the
 * third one takes.
 *
 * An EMPTY list is legal and means "no boundary drawn", which reads as
 * everywhere rather than nowhere — see `DeliveryReach`. Every storefront is in
 * that state on the day it opens, and a platform that read it as "nowhere" would
 * refuse every order a new restaurant took.
 */
final class MerchantDeliveryZoneController extends Controller
{
    /** GET /api/v1/marketplace/delivery-zones */
    public function index(Request $request): JsonResponse
    {
        $store = $this->store();

        return response()->json([
            'data' => DeliveryZoneResource::collection(
                $store->zones()->orderBy('sort_order')->get(),
            )->resolve($request),
            'meta' => [
                // What a zone falls back to when it sets neither. Sent so the
                // merchant form can show the inherited figure greyed out rather
                // than an empty box that looks like zero.
                'store_delivery_fee_tiyin' => $store->delivery_fee_tiyin,
                'store_min_order_tiyin' => $store->min_order_tiyin,
            ],
        ]);
    }

    /** PUT /api/v1/marketplace/delivery-zones */
    public function update(SaveDeliveryZonesRequest $request): JsonResponse
    {
        $store = $this->store();

        /** @var array<int, array<string, mixed>> $rows */
        $rows = $request->validated('zones');

        DB::transaction(function () use ($store, $rows): void {
            // Replaced wholesale rather than diffed. A boundary is a handful of
            // rows and matching them up by id to save two DELETEs would be a
            // merge nobody can test, guarding a table that never grows.
            $store->zones()->delete();

            foreach ($rows as $index => $row) {
                $store->zones()->create([
                    'label' => (string) $row['label'],
                    // Kilometres in, metres stored — no float is ever written.
                    'radius_m' => (int) round(((float) $row['radius_km']) * 1000),
                    'latitude_e6' => (int) round(((float) $row['latitude']) * 1_000_000),
                    'longitude_e6' => (int) round(((float) $row['longitude']) * 1_000_000),
                    'fee_tiyin' => isset($row['fee_tiyin']) ? (int) $row['fee_tiyin'] : null,
                    'min_order_tiyin' => isset($row['min_order_tiyin']) ? (int) $row['min_order_tiyin'] : null,
                    'sort_order' => $index,
                ]);
            }
        });

        return $this->index($request);
    }

    private function store(): Store
    {
        $store = Store::query()->first();

        if ($store === null) {
            throw ApiException::of('marketplace.no_storefront');
        }

        return $store;
    }
}
