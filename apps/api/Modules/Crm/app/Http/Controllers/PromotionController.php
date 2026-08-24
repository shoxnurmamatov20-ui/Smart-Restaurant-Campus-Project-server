<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Crm\Http\Requests\StorePromotionRequest;
use Modules\Crm\Http\Requests\UpdatePromotionRequest;
use Modules\Crm\Http\Resources\PromotionResource;
use Modules\Crm\Models\Promotion;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Basket offers — /api/v1/crm/promotions.
 *
 * `pause` and `resume` are separate routes rather than a PATCH carrying
 * `is_active`, and the reason is the screen: the console's control is one tap
 * with no form behind it, so a PATCH would have to be assembled from whatever
 * the page happened to be holding. A stale card would quietly rewrite the
 * rule — the hours, the dishes, the channel — while doing nothing more than
 * switching the offer off.
 *
 * `destroy` soft-deletes. The uses already recorded stay pointed at the old
 * row, which is the only way "how did last August's business lunch do" survives
 * the offer being rewritten in the spring.
 */
final class PromotionController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Promotion::class)
            ->allowedFilters([
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::exact('branch', 'branch_id'),
                AllowedFilter::callback('running', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->live();
                    }
                }),
            ])
            ->allowedSorts(['created_at', 'used_count', 'revenue_tiyin'])
            ->defaultSort('-used_count')
            ->paginate($perPage)
            ->withQueryString();

        return PromotionResource::collection($records);
    }

    public function store(StorePromotionRequest $request): PromotionResource
    {
        // refresh() so database defaults (counters, timestamps) reach the
        // client; without it the response reports null for every column the
        // request did not send.
        $promotion = Promotion::create($request->validated())->refresh();

        return new PromotionResource($promotion);
    }

    public function show(Promotion $promotion): PromotionResource
    {
        return new PromotionResource($promotion);
    }

    public function update(UpdatePromotionRequest $request, Promotion $promotion): PromotionResource
    {
        $promotion->update($request->validated());

        return new PromotionResource($promotion->refresh());
    }

    public function destroy(Promotion $promotion): Response
    {
        $promotion->delete();

        return response()->noContent();
    }

    /** Stop honouring it from the next ticket. */
    public function pause(Promotion $promotion): PromotionResource
    {
        $promotion->forceFill(['is_active' => false])->save();

        return new PromotionResource($promotion->refresh());
    }

    /** Start again, on the rule that was already there. */
    public function resume(Promotion $promotion): PromotionResource
    {
        $promotion->forceFill(['is_active' => true])->save();

        return new PromotionResource($promotion->refresh());
    }
}
