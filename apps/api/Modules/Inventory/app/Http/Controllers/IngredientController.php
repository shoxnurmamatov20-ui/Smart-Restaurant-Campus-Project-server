<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Controllers;

use App\Contracts\Inventory\StockLedger;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Inventory\Http\Requests\StoreIngredientRequest;
use Modules\Inventory\Http\Requests\StoreStockCountRequest;
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
                AllowedFilter::exact('barcode'),
                AllowedFilter::exact('unit'),
                AllowedFilter::exact('storage'),
                // The store screen's three chips. Exact rather than partial:
                // the list is closed and a partial match on 'bar' would also
                // answer for a shelf called 'barrel'.
                AllowedFilter::exact('store'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('name'),
                AllowedFilter::callback('low', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->lowStock();
                    }
                }),
            ])
            ->allowedSorts(['sku', 'name', 'store', 'stock_quantity', 'created_at'])
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
     * What is this thing in my hand?
     *
     * The lookup behind the staff app's scanner, and the half that was missing:
     * the camera has been one component away for as long as the screen has
     * existed, and `packages/surfaces/src/crew/data.ts` names this endpoint by
     * URL in its own TODO.
     *
     * Answers a list rather than a single row even for a barcode, and that is
     * not indecision. A scanner that answered 404 for an unregistered barcode
     * would give a storekeeper holding a crate nothing to do; an empty list is
     * a screen that can say "not on file — add it?" and carry on. It also lets
     * the same route serve the search box, which is what a person falls back to
     * when a label will not read.
     */
    public function lookup(Request $request): ResourceCollection
    {
        $validated = $request->validate([
            'barcode' => ['nullable', 'string', 'max:32'],
            'q' => ['nullable', 'string', 'max:64'],
        ]);

        $barcode = $validated['barcode'] ?? null;
        $term = $validated['q'] ?? null;

        $query = Ingredient::query()->active();

        if ($barcode !== null && $barcode !== '') {
            $query->where('barcode', $barcode);
        } elseif ($term !== null && $term !== '') {
            // `sku` is exact and `name` is a contains: a person typing a code
            // types all of it, and a person typing a name types the middle of
            // it. `ilike` because Uzbek shelf labels are not consistently cased.
            $query->where(function ($inner) use ($term): void {
                $inner->where('sku', $term)->orWhere('name', 'ilike', '%'.$term.'%');
            });
        } else {
            // Neither given. An empty answer rather than the whole store: this
            // route is a lookup, and a scanner that fired with no code should
            // not page through four hundred ingredients.
            $query->whereRaw('1 = 0');
        }

        return IngredientResource::collection($query->orderBy('name')->limit(25)->get());
    }

    /**
     * Close a count sheet: post every variance, leave the agreements alone.
     *
     * The whole sheet in one call because a count is one act. Line by line, a
     * tablet that lost the network halfway through would leave a shelf half
     * counted, and the storekeeper would have no way to tell which half.
     *
     * Every line goes through the same StockLedger the staff app's queue uses,
     * so a count typed at a desk and a count typed on a phone post identically
     * — including the two of them writing the same movement kind, which is what
     * makes the ledger readable afterwards.
     */
    public function count(StoreStockCountRequest $request, StockLedger $ledger): JsonResponse
    {
        /** @var array<int, array{ingredient_id: int, counted: int}> $lines */
        $lines = $request->validated()['lines'];
        $reference = $request->validated()['reference'] ?? null;

        $results = [];

        foreach ($lines as $line) {
            $change = $ledger->recordCount($line['ingredient_id'], $line['counted'], $reference);

            $results[] = $change === null
                // An id this restaurant does not have. Reported rather than
                // refused: one bad line must not throw away a sheet somebody
                // spent an hour on.
                ? ['ingredient_id' => $line['ingredient_id'], 'status' => 'unknown']
                : [
                    'ingredient_id' => $change->ingredientId,
                    'status' => $change->delta === 0 ? 'matched' : 'adjusted',
                    'variance' => $change->delta,
                    'balance' => $change->balance,
                ];
        }

        return response()->json([
            'data' => [
                'lines' => $results,
                'counted' => count($results),
                'adjusted' => count(array_filter($results, static fn (array $row): bool => $row['status'] === 'adjusted')),
            ],
        ], 201);
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
            throw ApiException::of('stock.insufficient', field: 'quantity');
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
