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
                /*
                 * Which shelf, through the ingredient that lives on it.
                 *
                 * A movement has no store of its own and should not: stock
                 * moves, shelves do not, and a copied label would be the second
                 * place the truth lives. `whereHas` costs a semi-join and keeps
                 * one answer to "where is this kept".
                 */
                AllowedFilter::callback('store', function ($query, $value): void {
                    $query->whereHas('ingredient', fn ($inner) => $inner->where('store', (string) $value));
                }),
                /*
                 * Everything from a moment onward. A plain comparison, not
                 * whereDate(): wrapping the column in a function loses the
                 * index, and ModuleBoundaryTest refuses it by name.
                 */
                AllowedFilter::callback('since', function ($query, $value): void {
                    $query->where('happened_at', '>=', $value);
                }),
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
