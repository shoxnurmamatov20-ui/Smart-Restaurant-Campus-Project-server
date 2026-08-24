<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Requests\AdvanceMarketOrderRequest;
use Modules\Marketplace\Http\Resources\MerchantOrderResource;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Services\MarketOrders;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * The merchant panel's queue — the ninety seconds a restaurant has to answer.
 *
 * Everything here runs under `auth:sanctum` + `tenant` + a Spatie permission,
 * exactly like every other console endpoint on the platform. That is the whole
 * difference from the consumer side, and it is why these routes need no entry
 * in `TenancyClaimTest` or `ModuleRouteGuardTest`: a restaurant employee has a
 * restaurant, so the policies scope every read to their own orders without this
 * controller writing a single `where`.
 *
 * Which is also the isolation test. Restaurant A's panel cannot see restaurant
 * B's orders — not because a query filters them out, but because PostgreSQL
 * will not return the rows.
 */
final class MerchantOrderController extends Controller
{
    private const MAX_PER_PAGE = 100;

    /**
     * GET /api/v1/marketplace/orders
     *
     * `?status=new` is the queue the panel opens on: `placed` orders, oldest
     * first, because the one nearest its ninety seconds is the one that matters.
     * Everything else is sorted newest first, which is how a history reads.
     */
    public function index(Request $request): JsonResponse
    {
        $status = (string) $request->string('status', 'new');

        $orders = MarketOrder::query()->with(['lines', 'consumer']);

        match ($status) {
            'new' => $orders->waiting(),
            'active' => $orders->whereIn('state', [
                MarketOrderState::Accepted->value,
                MarketOrderState::Cooking->value,
                MarketOrderState::Ready->value,
                MarketOrderState::CourierAssigned->value,
                MarketOrderState::Enroute->value,
            ])->orderByDesc('placed_at'),
            'done' => $orders->where('state', MarketOrderState::Delivered->value)->orderByDesc('delivered_at'),
            default => $orders->orderByDesc('placed_at'),
        };

        $page = $orders->paginate(min($request->integer('per_page', 25), self::MAX_PER_PAGE))->withQueryString();

        return response()->json([
            'data' => MerchantOrderResource::collection($page->items())->resolve($request),
            'meta' => [
                'total' => $page->total(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
            ],
        ]);
    }

    /**
     * PATCH /api/v1/marketplace/orders/{order}
     *
     * One endpoint for every move rather than `/accept`, `/reject`, `/ready`,
     * and the reason is the ladder: `MarketOrderState::canBecome()` already
     * knows which moves are legal from where, and four endpoints would each have
     * to ask it the same question and then be kept in step with it. The body
     * names the target rung; the service does whatever that rung means — which
     * for `accepted` is opening a bill and firing a kitchen ticket.
     *
     * The route model binding resolves by `number`, and the policies resolve
     * whether it is this restaurant's at all. An order from next door is not
     * found.
     */
    public function update(AdvanceMarketOrderRequest $request, MarketOrder $order, MarketOrders $orders): JsonResponse
    {
        /*
         * The promise, revised without moving the ladder.
         *
         * The panel's "+5 minutes" on a cooking order used to update a local
         * map and flash the new total: the merchant believed the guest had been
         * told, and the guest's ETA never changed — which is the entire point of
         * the button. There is no rung for it, because nothing about the order
         * has moved; only what the restaurant now promises.
         */
        if (! $request->filled('state')) {
            $revised = $orders->reviseEta($order, $request->integer('eta_minutes'));

            return response()->json([
                'data' => (new MerchantOrderResource($revised->load(['lines', 'consumer'])))->resolve($request),
            ]);
        }

        $target = MarketOrderState::tryFrom((string) $request->string('state'));

        if ($target === null) {
            throw ApiException::of('marketplace.invalid_transition', field: 'state', meta: [
                'from' => $order->state,
                'to' => (string) $request->string('state'),
            ]);
        }

        $updated = $orders->advance($order, $target, [
            'reason' => $request->filled('reason') ? (string) $request->string('reason') : null,
            'courier_id' => $request->filled('courier_id') ? $request->integer('courier_id') : null,
        ]);

        return response()->json([
            'data' => (new MerchantOrderResource($updated->load(['lines', 'consumer'])))->resolve($request),
        ]);
    }
}
