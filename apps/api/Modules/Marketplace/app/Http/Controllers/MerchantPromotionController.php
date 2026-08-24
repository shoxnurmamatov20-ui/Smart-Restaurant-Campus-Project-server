<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Requests\StorePromotionRequest;
use Modules\Marketplace\Http\Requests\UpdatePromotionRequest;
use Modules\Marketplace\Http\Resources\PromotionResource;
use Modules\Marketplace\Models\Promotion;
use Modules\Marketplace\Models\Store;

/**
 * A restaurant's own offers on the marketplace.
 *
 * The budget is the interesting field. A promotion spends it as orders use the
 * code, and `Promotion::spendable()` refuses one that has run out — so a
 * merchant who set aside two million so'm for the week spends two million,
 * whatever happens at the weekend.
 */
final class MerchantPromotionController extends Controller
{
    /** GET /api/v1/marketplace/promotions */
    public function index(Request $request): JsonResponse
    {
        $promotions = Promotion::query()
            // Running first — that is what the merchant came to look at — then
            // by start date, so what is coming sits above what has finished.
            ->orderByRaw("case when state = 'running' then 0 when state = 'scheduled' then 1 else 2 end")
            ->orderByDesc('starts_on')
            ->limit(60)
            ->get();

        return response()->json(['data' => PromotionResource::collection($promotions)->resolve($request)]);
    }

    /** POST /api/v1/marketplace/promotions */
    public function store(StorePromotionRequest $request): JsonResponse
    {
        $store = Store::query()->first();

        if ($store === null) {
            throw ApiException::of('marketplace.no_storefront');
        }

        $promotion = Promotion::create([
            'store_id' => $store->id,
            // Codes are unique across the whole marketplace, and uppercase so
            // that "osh2026" typed on a phone finds the one that was created.
            'code' => $request->filled('code') ? mb_strtoupper((string) $request->string('code')) : null,
            ...$request->safe()->except('code'),
        ]);

        return response()->json(['data' => (new PromotionResource($promotion))->resolve($request)], 201);
    }

    /**
     * PATCH /api/v1/marketplace/promotions/{promotion}
     *
     * Every button on the merchant's offer card comes here — pause, resume,
     * cancel, and change the budget. One endpoint rather than four, because all
     * four are the same row moving, and four endpoints would each hold their own
     * idea of which moves are legal and then drift apart.
     *
     * The POST beside it is explicitly NOT a substitute for any of them: it
     * creates. Pausing through a create leaves the running offer running and
     * adds a second one on the same three days, each holding its own budget.
     */
    public function update(UpdatePromotionRequest $request, Promotion $promotion): JsonResponse
    {
        $changes = [];

        if ($request->has('state')) {
            $wanted = (string) $request->string('state');

            /*
             * Which moves are legal, and each refusal has a reason a merchant
             * would recognise:
             *
             *   an ENDED or CANCELLED offer never moves again — its days are
             *   gone, and reviving one would back-date a campaign that ran.
             *   `running` is only reachable from `paused`; a scheduled offer
             *   starts on the day it was scheduled for, and letting a merchant
             *   start it early spends a budget on a day nobody planned.
             */
            $allowed = match ($promotion->state) {
                'running' => ['paused', 'cancelled'],
                'paused' => ['running', 'cancelled'],
                'scheduled' => ['cancelled'],
                default => [],
            };

            if ($wanted !== $promotion->state && ! in_array($wanted, $allowed, true)) {
                throw ApiException::of('marketplace.promotion_transition', meta: [
                    'state' => $promotion->state,
                    'wanted' => $wanted,
                    'allowed' => $allowed,
                ]);
            }

            $changes['state'] = $wanted;
        }

        if ($request->has('budget_tiyin')) {
            $budget = $request->integer('budget_tiyin');

            /*
             * A ceiling below what has already gone is not a smaller budget, it
             * is an offer that is retrospectively overspent — and
             * `Promotion::spendable()` compares the two columns, so the offer
             * would simply stop working with no explanation on any screen.
             * Refused with both figures so the sheet can say what the floor is.
             */
            if ($budget < $promotion->spent_tiyin) {
                throw ApiException::of('marketplace.budget_below_spend', field: 'budget_tiyin', meta: [
                    'spent_tiyin' => $promotion->spent_tiyin,
                    'budget_tiyin' => $budget,
                ]);
            }

            $changes['budget_tiyin'] = $budget;
        }

        if ($changes !== []) {
            $promotion->forceFill($changes)->save();
        }

        return response()->json(['data' => (new PromotionResource($promotion))->resolve($request)]);
    }
}
