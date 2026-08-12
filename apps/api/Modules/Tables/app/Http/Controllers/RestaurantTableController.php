<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Tables\Http\Requests\StoreRestaurantTableRequest;
use Modules\Tables\Http\Requests\UpdateRestaurantTableRequest;
use Modules\Tables\Http\Resources\RestaurantTableResource;
use Modules\Tables\Models\RestaurantTable;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for tables.
 *
 * Mounted under /api/v1/tables/tables and gated by Spatie permission
 * middleware on the route definition (Modules/Tables/routes/api.php).
 */
final class RestaurantTableController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(RestaurantTable::class)
            ->allowedFilters([
                AllowedFilter::exact('label'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('hall', 'hall_id'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::callback('free', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->free();
                    }
                }),
            ])
            ->allowedSorts(['label', 'seats', 'created_at'])
            ->allowedIncludes(['hall'])
            ->defaultSort('label')
            ->paginate($perPage)
            ->withQueryString();

        return RestaurantTableResource::collection($records);
    }

    public function store(StoreRestaurantTableRequest $request): RestaurantTableResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = RestaurantTable::create($request->validated())->refresh();

        return new RestaurantTableResource($record->load('hall'));
    }

    public function show(RestaurantTable $table): RestaurantTableResource
    {
        return new RestaurantTableResource($table->load('hall'));
    }

    public function update(UpdateRestaurantTableRequest $request, RestaurantTable $table): RestaurantTableResource
    {
        $table->update($request->validated());

        return new RestaurantTableResource($table->refresh()->load('hall'));
    }

    public function destroy(RestaurantTable $table): Response
    {
        $table->delete();

        return response()->noContent();
    }

    /**
     * Move a table between free / occupied / reserved / cleaning.
     *
     * A dedicated endpoint rather than a PATCH on `status`: seating a table is
     * a floor action a host performs dozens of times a shift, and it must not
     * require permission to edit the table's seats or hall.
     */
    public function changeStatus(Request $request, RestaurantTable $table): RestaurantTableResource
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(RestaurantTable::STATUSES)],
        ]);

        $table->update(['status' => $validated['status']]);

        return new RestaurantTableResource($table->refresh());
    }
}
