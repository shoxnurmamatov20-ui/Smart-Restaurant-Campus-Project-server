<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Inventory\Http\Requests\StoreStockMovementRequest;
use Modules\Inventory\Http\Requests\UpdateStockMovementRequest;
use Modules\Inventory\Http\Resources\StockMovementResource;
use Modules\Inventory\Models\StockMovement;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for stock movements.
 *
 * Mounted under /api/v1/inventory/movements and gated by Spatie permission
 * middleware on the route definition (Modules/Inventory/routes/api.php).
 */
final class StockMovementController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(StockMovement::class)
            ->allowedFilters([
                AllowedFilter::exact('ingredient', 'ingredient_id'),
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('reference'),
            ])
            ->allowedSorts(['happened_at', 'quantity', 'created_at'])
            ->allowedIncludes(['ingredient'])
            ->defaultSort('-happened_at')
            ->paginate($perPage)
            ->withQueryString();

        return StockMovementResource::collection($records);
    }

    public function store(StoreStockMovementRequest $request): StockMovementResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = StockMovement::create($request->validated())->refresh();

        return new StockMovementResource($record->load('ingredient'));
    }

    public function show(StockMovement $movement): StockMovementResource
    {
        return new StockMovementResource($movement->load('ingredient'));
    }

    public function update(UpdateStockMovementRequest $request, StockMovement $movement): StockMovementResource
    {
        $movement->update($request->validated());

        return new StockMovementResource($movement->refresh()->load('ingredient'));
    }

    public function destroy(StockMovement $movement): Response
    {
        $movement->delete();

        return response()->noContent();
    }
}
