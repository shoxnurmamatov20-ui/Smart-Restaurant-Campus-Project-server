<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Middleware\RequireConsumerToken;
use Modules\Marketplace\Http\Requests\OpenDisputeRequest;
use Modules\Marketplace\Http\Requests\PlaceMarketOrderRequest;
use Modules\Marketplace\Http\Requests\RateMarketOrderRequest;
use Modules\Marketplace\Http\Resources\MarketOrderResource;
use Modules\Marketplace\Models\Dispute;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Services\MarketOrders;
use Modules\Marketplace\Services\StorefrontDirectory;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * Ordering dinner across the marketplace, and watching it come.
 *
 * Every method starts from the token and looks the order up BY CONSUMER —
 * `StorefrontDirectory::orderOf()` takes the consumer id and the number
 * together, so an order that belongs to somebody else is not found rather than
 * refused. Not found is the right answer: refusal would confirm the number
 * exists, and marketplace numbers are sequential.
 *
 * The reads cross tenants because a customer's history does — they ordered from
 * four restaurants last month — and the writes run inside the store's own
 * tenancy so every row is stamped and every policy is on. Both live in
 * `StorefrontDirectory`, which is the only class in this module allowed to open
 * the connection.
 */
final class ConsumerOrderController extends Controller
{
    /** GET /api/v1/mp/orders — my orders, newest first. */
    public function index(Request $request, StorefrontDirectory $directory): JsonResponse
    {
        $orders = $directory->ordersOf(RequireConsumerToken::of($request)->id);

        return response()->json(['data' => MarketOrderResource::collection($orders)->resolve($request)]);
    }

    /** GET /api/v1/mp/orders/{number} — the tracking screen. */
    public function show(Request $request, string $number, StorefrontDirectory $directory): JsonResponse
    {
        return response()->json(['data' => (new MarketOrderResource(
            $this->mine($request, $number, $directory),
        ))->resolve($request)]);
    }

    /**
     * POST /api/v1/mp/orders — place it.
     *
     * The body carries dish ids, quantities and an address. It does NOT carry a
     * price, a subtotal or a total, and the service refuses to read one if it
     * did: a marketplace client is a web page a stranger can edit.
     */
    public function store(PlaceMarketOrderRequest $request, MarketOrders $orders, StorefrontDirectory $directory): JsonResponse
    {
        $consumer = RequireConsumerToken::of($request);
        $store = $directory->bySlug((string) $request->string('store'));

        if ($store === null) {
            throw ApiException::of('marketplace.store_not_found', field: 'store');
        }

        /** @var array<int, array{menu_item_id: int, quantity: int, note?: string|null}> $lines */
        $lines = $request->validated('lines');

        $order = $orders->place($consumer, $store, $lines, [
            'address' => (string) $request->string('address'),
            'address_note' => $request->filled('address_note') ? (string) $request->string('address_note') : null,
            'pay_rail' => (string) $request->string('pay_rail', 'cash'),
            'promo_code' => $request->filled('promo_code') ? (string) $request->string('promo_code') : null,
            'client_reference' => $request->filled('client_reference') ? (string) $request->string('client_reference') : null,
            'latitude_e6' => $request->filled('latitude') ? (int) round($request->float('latitude') * 1_000_000) : null,
            'longitude_e6' => $request->filled('longitude') ? (int) round($request->float('longitude') * 1_000_000) : null,
        ]);

        return response()->json(
            // Already loaded by the service, inside the store's tenancy.
            ['data' => (new MarketOrderResource($order))->resolve($request)],
            201,
        );
    }

    /**
     * POST /api/v1/mp/orders/{number}/cancel
     *
     * Only while it is `placed` or `accepted` — the ladder decides, not this
     * controller. Once a pan is hot the restaurant has spent the ingredients,
     * and a free cancellation after that is one somebody will use every night.
     * After it, the guest opens a dispute and a person reads it.
     */
    public function cancel(Request $request, string $number, MarketOrders $orders, StorefrontDirectory $directory): JsonResponse
    {
        $order = $this->mine($request, $number, $directory);

        if (! $order->state()->guestMayCancel()) {
            throw ApiException::of('marketplace.too_late_to_cancel', meta: ['state' => $order->state]);
        }

        $updated = $orders->advance($order, MarketOrderState::Cancelled, [
            'reason' => $request->filled('reason') ? (string) $request->string('reason') : 'Mijoz bekor qildi',
        ]);

        return response()->json(['data' => (new MarketOrderResource($updated))->resolve($request)]);
    }

    /**
     * POST /api/v1/mp/orders/{number}/rate
     *
     * Delivered orders only, and once. A rating is what the directory sorts by,
     * so a second one from the same guest is a second vote — and the row that
     * would let somebody cast it is the row this checks.
     */
    public function rate(RateMarketOrderRequest $request, string $number, StorefrontDirectory $directory): JsonResponse
    {
        $order = $this->mine($request, $number, $directory);

        if ($order->state !== MarketOrderState::Delivered->value) {
            throw ApiException::of('marketplace.not_delivered_yet', meta: ['state' => $order->state]);
        }

        if ($order->rating !== null) {
            throw ApiException::of('marketplace.already_rated');
        }

        $stars = (int) $request->integer('rating');

        $store = $order->store;

        if ($store === null) {
            throw ApiException::of('marketplace.store_not_found');
        }

        /*
         * Everything below runs inside the store's tenancy, the reload
         * included. Outside it this connection cannot see the order at all —
         * a `refresh()` there raises ModelNotFound on a write that succeeded,
         * and answers the guest 404 for a rating that was recorded.
         */
        $rated = $directory->asStore($store, static function () use ($order, $store, $stars, $request): MarketOrder {
            $order->forceFill([
                'rating' => $stars,
                'rating_comment' => $request->filled('comment') ? (string) $request->string('comment') : null,
                'rated_at' => now(),
            ])->save();

            /*
             * The storefront's running average, kept in tenths.
             *
             * Recomputed from the count rather than re-averaging the whole
             * history: a restaurant with forty thousand ratings should not
             * read forty thousand rows because one guest gave it four stars.
             * The arithmetic is the incremental mean, in integers —
             * `(old * n + new * 10) / (n + 1)` — so a rating never moves the
             * figure by a rounding artefact the way a float average would.
             */
            $count = $store->reviews_count;
            $total = $store->rating_tenths * $count + $stars * 10;

            $store->forceFill([
                'reviews_count' => $count + 1,
                'rating_tenths' => intdiv($total + intdiv($count + 1, 2), $count + 1),
            ])->save();

            return $order->refresh()->load(['lines', 'store']);
        });

        return response()->json(['data' => (new MarketOrderResource($rated))->resolve($request)]);
    }

    /**
     * POST /api/v1/mp/orders/{number}/dispute — something went wrong.
     *
     * Two of the four kinds settle themselves and two are put to the merchant;
     * `Dispute::settlesItself()` holds that rule, because it is about money
     * rather than about screens. One complaint per order — the unique index
     * says so — so a guest with a second problem adds to the first rather than
     * opening a race between two refunds.
     */
    public function dispute(OpenDisputeRequest $request, string $number, StorefrontDirectory $directory): JsonResponse
    {
        $order = $this->mine($request, $number, $directory);

        if ($order->delivered_at === null && $order->state !== MarketOrderState::Enroute->value) {
            // Nothing has arrived yet, so there is nothing to be wrong with it.
            // A guest who wants out at this point is cancelling, not complaining.
            throw ApiException::of('marketplace.nothing_to_dispute', meta: ['state' => $order->state]);
        }

        $store = $order->store;

        if ($store === null) {
            throw ApiException::of('marketplace.store_not_found');
        }

        $kind = (string) $request->string('kind');
        $amount = min((int) $request->integer('amount_tiyin'), $order->total_tiyin);

        $dispute = $directory->asStore($store, static function () use ($order, $kind, $amount, $request): Dispute {
            if ($order->dispute()->exists()) {
                throw ApiException::of('marketplace.dispute_already_open');
            }

            $automatic = Dispute::settlesItself($kind, $amount);

            return Dispute::create([
                'order_id' => $order->id,
                'consumer_id' => $order->consumer_id,
                'kind' => $kind,
                'amount_tiyin' => $amount,
                'body' => $request->filled('body') ? (string) $request->string('body') : null,
                'automatic' => $automatic,
                // An automatic credit is already decided; the merchant is being
                // told. The other two start the two-hour clock.
                'state' => $automatic ? 'accepted' : 'open',
                'resolved_at' => $automatic ? now() : null,
                'deadline_at' => $automatic ? null : now()->addHours(Dispute::ANSWER_HOURS),
            ]);
        });

        return response()->json([
            'data' => [
                'state' => $dispute->state,
                'automatic' => $dispute->automatic,
                'amount_tiyin' => $dispute->amount_tiyin,
                'deadline_at' => $dispute->deadline_at?->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * One order of mine, or a 404.
     *
     * Scoped by the token's consumer id and the number together. Somebody
     * else's order is NOT FOUND rather than forbidden: a 403 confirms the
     * number exists, and these numbers run in sequence.
     */
    private function mine(Request $request, string $number, StorefrontDirectory $directory): MarketOrder
    {
        $order = $directory->orderOf(RequireConsumerToken::of($request)->id, $number);

        if ($order === null) {
            throw ApiException::of('request.not_found');
        }

        return $order;
    }
}
