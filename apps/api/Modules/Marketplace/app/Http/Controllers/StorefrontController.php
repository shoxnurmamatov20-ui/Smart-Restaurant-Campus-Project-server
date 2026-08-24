<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Resources\DeliveryZoneResource;
use Modules\Marketplace\Http\Resources\StoreResource;
use Modules\Marketplace\Models\DeliveryZone;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Services\StoreCatalogue;
use Modules\Marketplace\Services\StorefrontDirectory;

/**
 * The shop window: who is trading, and what they sell.
 *
 * The only two endpoints on this platform that are BOTH anonymous and
 * cross-tenant, and that combination is the whole of the marketplace's
 * architectural novelty. Everything else here is either scoped to one
 * restaurant (the merchant panel) or to one person (a consumer's own orders).
 *
 * They are safe to leave open because of what they answer: a name, a cuisine, a
 * delivery window, a rating and a price list. That is a shop window — it is
 * published on purpose, and a marketplace whose directory needed a login would
 * have nothing to show anybody. No customer, no order, no takings and no
 * commission is reachable from here.
 *
 * `TenancyClaimTest` records both with that reason, and `StorefrontDirectory` is
 * the one class allowed to open the connection across restaurants. Nothing in
 * this controller calls `withoutTenancy()` itself.
 */
final class StorefrontController extends Controller
{
    /**
     * GET /api/v1/mp/stores — the directory.
     *
     * `?vertical=` and `?cuisine=` are the design's left rail and its twelve
     * circles; `?q=` is the search box, which matches the trading name, the
     * subtitle and the badge in all three languages, because somebody typing
     * "bepul" is looking for free delivery and that phrase lives only on a
     * badge.
     *
     * `?near=41.311081,69.240562` is where the guest is standing. Without it
     * every card answers `distance_metres: null` rather than a made-up number —
     * a marketplace that invents distances sends couriers to the wrong side of
     * the city.
     */
    public function index(Request $request, StorefrontDirectory $directory): JsonResponse
    {
        [$latitude, $longitude] = $this->near($request);

        $stores = $directory->live(
            vertical: $request->filled('vertical') ? (string) $request->string('vertical') : null,
            cuisine: $request->filled('cuisine') ? (string) $request->string('cuisine') : null,
            query: $request->filled('q') ? (string) $request->string('q') : null,
        );

        $cards = $stores->map(
            static fn (Store $store): StoreResource => new StoreResource(
                $store,
                $store->metresFrom($latitude, $longitude),
            ),
        );

        /*
         * Sorted by distance when there is one, and only then. The directory
         * itself orders by rating — the right answer for somebody browsing
         * from a desk — but a person standing in a street wants the near ones
         * first, and re-sorting here rather than in SQL keeps the haversine out
         * of a query that would then be unable to use an index anyway.
         */
        if ($latitude !== null) {
            $cards = $cards->sortBy(
                static fn (StoreResource $card): int => $card->resource instanceof Store
                    ? ($card->resource->metresFrom($latitude, $longitude) ?? PHP_INT_MAX)
                    : PHP_INT_MAX,
            )->values();
        }

        return response()->json(['data' => $cards->all()]);
    }

    /**
     * GET /api/v1/mp/stores/{store} — one shop and its market menu.
     *
     * The menu is read through `MenuCatalog` inside the restaurant's own
     * tenancy, so this module touches no Menu table and the policies are on
     * while it does. A dish the kitchen has run out of comes back flagged
     * rather than missing — the same `board()`-not-`sellable()` choice a till
     * makes, and for the same reason: a guest shown a dish crossed out knows to
     * come back tomorrow, while one who never sees it concludes the restaurant
     * does not make it.
     */
    public function show(string $store, StorefrontDirectory $directory, StoreCatalogue $catalogue): JsonResponse
    {
        $found = $directory->bySlug($store);

        if ($found === null) {
            throw ApiException::of('marketplace.store_not_found');
        }

        /*
         * The menu and the boundary are read in the same trip into the store's
         * tenancy. `delivery_zones` carries `tenant_id` behind a policy, so a
         * read outside `asStore()` would answer zero rows and the client would
         * conclude the shop delivers everywhere.
         */
        [$menu, $zones] = $directory->asStore($found, static fn (): array => [
            $catalogue->listing($found),
            $found->zones()->orderBy('sort_order')->get(),
        ]);

        return response()->json([
            'data' => [
                'store' => (new StoreResource($found))->resolve(),

                /*
                 * How far this shop will ride, published so the client can
                 * answer BEFORE a basket is built — `packages/surfaces/src/mp/geo.ts`
                 * holds the same arithmetic. The server refuses the same
                 * addresses at checkout; this is the early half, and the early
                 * half is the one that keeps a guest from shopping for twenty
                 * minutes and then being told no.
                 *
                 * An empty list means no boundary has been drawn, which reads
                 * as everywhere rather than nowhere. Every storefront is in
                 * that state on the day it opens.
                 */
                'delivery' => [
                    'zones' => DeliveryZoneResource::collection($zones)->resolve(),
                    'max_radius_km' => $zones->isEmpty()
                        ? null
                        : round($zones->max(static fn (DeliveryZone $zone): int => $zone->radius_m) / 1000, 2),
                ],

                'menu' => array_map(static fn (array $row): array => [
                    'menu_item_id' => $row['dish']->id,
                    'title' => $row['dish']->title,
                    // The chip this dish sits under, in the reader's own
                    // language. Sent rather than derived: a client that groups
                    // by the dish's own name gives every dish its own chip.
                    'section' => $row['section'],
                    'description' => $row['dish']->description,
                    'price_tiyin' => $row['price'],
                    // What the dining room charges, when it differs. The design
                    // strikes it through beside the market price; equal prices
                    // answer null so nothing is struck through for no reason.
                    'was_tiyin' => $row['price'] === $row['dish']->price ? null : $row['dish']->price,
                    'image_url' => $row['dish']->imageUrl,
                    // Every size, so the store's 96px row thumbnail asks for
                    // `thumb` and the dish sheet for `full` — see Dish::$image.
                    'image' => $row['dish']->image,
                    'kind' => $row['dish']->kind,
                    'sold_out' => $row['dish']->isStopped,
                ], $menu),
            ],
        ]);
    }

    /**
     * Where the guest says they are, or two nulls.
     *
     * Parsed rather than trusted: a malformed `near` is ignored instead of
     * refused, because a browser that cannot get a fix should still see the
     * directory. Out-of-range values are dropped for the same reason — a
     * latitude of 900 is a bug in a client, not a request to answer 422.
     *
     * @return array{0: float|null, 1: float|null}
     */
    private function near(Request $request): array
    {
        $parts = explode(',', (string) $request->string('near'));

        if (count($parts) !== 2 || ! is_numeric($parts[0]) || ! is_numeric($parts[1])) {
            return [null, null];
        }

        $latitude = (float) $parts[0];
        $longitude = (float) $parts[1];

        if (abs($latitude) > 90 || abs($longitude) > 180) {
            return [null, null];
        }

        return [$latitude, $longitude];
    }
}
