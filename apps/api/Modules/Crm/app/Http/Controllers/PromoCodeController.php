<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Crm\Http\Requests\StorePromoCodeRequest;
use Modules\Crm\Http\Requests\UpdatePromoCodeRequest;
use Modules\Crm\Http\Resources\PromoCodeResource;
use Modules\Crm\Models\PromoCode;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Campaigns, from the console — /api/v1/crm/promo-codes.
 *
 * The one thing worth stating is what `destroy` does: it soft-deletes, and the
 * unique index on the code is partial on `deleted_at is null`, so ending
 * `OSH15` frees the word for a new campaign in the spring. The redemptions
 * already recorded against the old one stay pointed at the old row, which is
 * the only way "how did last August's promotion do" survives the word being
 * reused.
 */
final class PromoCodeController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(PromoCode::class)
            ->allowedFilters([
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('code'),
            ])
            ->allowedSorts(['code', 'created_at', 'used_count'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return PromoCodeResource::collection($records);
    }

    public function store(StorePromoCodeRequest $request): PromoCodeResource
    {
        $payload = $request->validated();
        $payload['code'] = PromoCode::normalise((string) $payload['code']);

        if (PromoCode::query()->where('code', $payload['code'])->exists()) {
            // Answered here rather than left to the unique index, so the
            // message names the field a form can highlight.
            throw ApiException::of('promo.code_taken', field: 'code');
        }

        // refresh() so database defaults (used_count, timestamps) reach the
        // client; without it the response reports null for every column the
        // request did not send.
        $promo = PromoCode::create($payload)->refresh();

        return new PromoCodeResource($promo);
    }

    public function show(PromoCode $promoCode): PromoCodeResource
    {
        return new PromoCodeResource($promoCode);
    }

    public function update(UpdatePromoCodeRequest $request, PromoCode $promoCode): PromoCodeResource
    {
        $promoCode->update($request->validated());

        return new PromoCodeResource($promoCode->refresh());
    }

    public function destroy(PromoCode $promoCode): Response
    {
        $promoCode->delete();

        return response()->noContent();
    }
}
