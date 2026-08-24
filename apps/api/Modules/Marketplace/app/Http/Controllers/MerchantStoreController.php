<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Requests\UpdateStoreSettingsRequest;
use Modules\Marketplace\Http\Resources\StoreResource;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * The storefront's own settings, and how it is doing.
 *
 * Two things a merchant may change here and a long list they may not. They own
 * the shop window — whether it is taking orders, how long it says it takes, what
 * the delivery costs, the minimum basket. They do not own `status` (the
 * platform's word on whether the shop is on the market at all) or
 * `commission_percent` (a commercial term, negotiated rather than typed), and
 * both are absent from the form request rather than filtered here, so there is
 * no path that reaches them.
 */
final class MerchantStoreController extends Controller
{
    /** GET /api/v1/marketplace/settings */
    public function show(Request $request): JsonResponse
    {
        $store = $this->store();

        return response()->json([
            'data' => [
                ...(new StoreResource($store))->resolve($request),
                // Two fields the public card deliberately omits. A guest has no
                // use for either; a merchant needs to see what they are paying
                // and whether the platform has them live.
                'status' => $store->status,
                'commission_percent' => $store->commission_percent,
            ],
        ]);
    }

    /** PATCH /api/v1/marketplace/settings */
    public function update(UpdateStoreSettingsRequest $request): JsonResponse
    {
        $store = $this->store();
        $store->fill($request->validated())->save();

        return $this->show($request);
    }

    /**
     * GET /api/v1/marketplace/performance
     *
     * The three numbers the platform judges a restaurant by, and each is a
     * different kind of promise: how fast they answer, how often they refuse,
     * and what guests thought. All three come from the same thirty days so a
     * merchant can compare them against each other.
     */
    public function performance(): JsonResponse
    {
        $store = $this->store();
        $since = now()->subDays(30);

        $orders = MarketOrder::query()->where('placed_at', '>=', $since);

        $total = (clone $orders)->count();
        $rejected = (clone $orders)->where('state', MarketOrderState::Rejected->value)->count();
        $cancelled = (clone $orders)->where('state', MarketOrderState::Cancelled->value)->count();

        /*
         * Average seconds to accept, over the orders that WERE accepted.
         *
         * Rejections are excluded on purpose: a restaurant that refuses an
         * order in four seconds is fast at refusing, and folding that into
         * "how quickly do they answer" rewards exactly the behaviour the
         * rejection rate beside it is meant to punish.
         *
         * Computed in SQL because the alternative is loading a month of orders
         * to average two columns. `extract(epoch …)` on two stored timestamps
         * involves no clock and no timezone — unlike `now()`, which
         * `ModuleBoundaryTest` refuses in raw SQL for exactly that reason.
         */
        $acceptSeconds = (clone $orders)
            ->whereNotNull('accepted_at')
            ->selectRaw('avg(extract(epoch from (accepted_at - placed_at))) as seconds')
            ->value('seconds');

        return response()->json([
            'data' => [
                'window_days' => 30,
                'orders' => $total,
                'accept_seconds' => $acceptSeconds === null ? null : (int) round((float) $acceptSeconds),
                // Two decimals as an integer percentage of a hundredth, so no
                // float reaches a screen: 4.35% is 435.
                'reject_rate_bp' => $total === 0 ? 0 : intdiv($rejected * 10_000 + intdiv($total, 2), $total),
                'cancel_rate_bp' => $total === 0 ? 0 : intdiv($cancelled * 10_000 + intdiv($total, 2), $total),
                'rating' => $store->rating(),
                'reviews_count' => $store->reviews_count,
                // What the panel counts down beside every new order.
                'accept_seconds_allowed' => MarketOrder::ACCEPT_SECONDS,
            ],
        ]);
    }

    /**
     * This restaurant's storefront, found by the policies rather than by an id.
     *
     * A merchant request is already scoped to one tenant, so `first()` can only
     * ever answer their own. A restaurant with no storefront yet is refused
     * clearly rather than shown an empty screen it would read as "no orders".
     */
    private function store(): Store
    {
        $store = Store::query()->first();

        if ($store === null) {
            throw ApiException::of('marketplace.no_storefront');
        }

        return $store;
    }
}
