<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Inventory\Http\Requests\StoreIngredientRequest;
use Modules\Inventory\Http\Requests\UpdateIngredientRequest;
use Modules\Inventory\Http\Resources\IngredientResource;
use Modules\Inventory\Http\Resources\StockMovementResource;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for ingredients.
 *
 * Mounted under /api/v1/inventory/ingredients and gated by Spatie permission
 * middleware on the route definition (Modules/Inventory/routes/api.php).
 */
final class IngredientController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Ingredient::class)
            ->allowedFilters([
                AllowedFilter::exact('sku'),
                AllowedFilter::exact('unit'),
                AllowedFilter::exact('storage'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('name'),
                AllowedFilter::callback('low', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->lowStock();
                    }
                }),
            ])
            ->allowedSorts(['sku', 'name', 'stock_quantity', 'created_at'])
            ->allowedIncludes(['movements'])
            ->defaultSort('name')
            ->paginate($perPage)
            ->withQueryString();

        return IngredientResource::collection($records);
    }

    public function store(StoreIngredientRequest $request): IngredientResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Ingredient::create($request->validated())->refresh();

        return new IngredientResource($record->load('movements'));
    }

    public function show(Ingredient $ingredient): IngredientResource
    {
        return new IngredientResource($ingredient->load('movements'));
    }

    public function update(UpdateIngredientRequest $request, Ingredient $ingredient): IngredientResource
    {
        $ingredient->update($request->validated());

        return new IngredientResource($ingredient->refresh()->load('movements'));
    }

    public function destroy(Ingredient $ingredient): Response
    {
        $ingredient->delete();

        return response()->noContent();
    }

    /**
     * Receive, consume or write off stock.
     *
     * Positive quantities add, negative remove. A write-off must carry a reason
     * — unexplained shrinkage is exactly what this module exists to surface.
     */
    public function move(Request $request, Ingredient $ingredient): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['required', Rule::in(StockMovement::KINDS)],
            'quantity' => ['required', 'integer', 'not_in:0'],
            'reason' => ['required_if:kind,write_off', 'nullable', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:64'],
        ]);

        if ($validated['quantity'] < 0 && $ingredient->stock_quantity + $validated['quantity'] < 0) {
            abort(422, 'Ombor qoldig\'idan ko\'p chiqim qilib bo\'lmaydi.');
        }

        $movement = $ingredient->move(
            $validated['kind'],
            (int) $validated['quantity'],
            $validated['reason'] ?? null,
            $validated['reference'] ?? null,
        );

        return response()->json([
            'movement' => new StockMovementResource($movement),
            'ingredient' => new IngredientResource($ingredient->refresh()),
        ], 201);
    }
}
