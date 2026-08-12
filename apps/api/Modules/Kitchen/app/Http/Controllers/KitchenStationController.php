<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Kitchen\Http\Requests\StoreKitchenStationRequest;
use Modules\Kitchen\Http\Requests\UpdateKitchenStationRequest;
use Modules\Kitchen\Http\Resources\KitchenStationResource;
use Modules\Kitchen\Models\KitchenStation;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for kitchen stations.
 *
 * Mounted under /api/v1/kitchen/stations and gated by Spatie permission
 * middleware on the route definition (Modules/Kitchen/routes/api.php).
 */
final class KitchenStationController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(KitchenStation::class)
            ->allowedFilters([
                AllowedFilter::exact('code'),
                AllowedFilter::exact('is_active'),
            ])
            ->allowedSorts(['code', 'sort_order', 'created_at'])
            ->defaultSort('sort_order')
            ->paginate($perPage)
            ->withQueryString();

        return KitchenStationResource::collection($records);
    }

    public function store(StoreKitchenStationRequest $request): KitchenStationResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = KitchenStation::create($request->validated())->refresh();

        return new KitchenStationResource($record);
    }

    public function show(KitchenStation $station): KitchenStationResource
    {
        return new KitchenStationResource($station);
    }

    public function update(UpdateKitchenStationRequest $request, KitchenStation $station): KitchenStationResource
    {
        $station->update($request->validated());

        return new KitchenStationResource($station->refresh());
    }

    public function destroy(KitchenStation $station): Response
    {
        $station->delete();

        return response()->noContent();
    }
}
