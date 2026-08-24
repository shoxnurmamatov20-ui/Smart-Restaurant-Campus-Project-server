<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Tables\Http\Requests\StoreRestaurantTableRequest;
use Modules\Tables\Http\Requests\UpdateRestaurantTableRequest;
use Modules\Tables\Http\Resources\RestaurantTableResource;
use Modules\Tables\Models\RestaurantTable;
use Modules\Tables\Services\TableQrCode;
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
                /*
                 * A partial label, because that is how a person asks for a
                 * table. `filter[label]` above is exact and stays exact — it is
                 * what the floor plan and the QR route use to pin one table.
                 * This is the crew app's search box: somebody types "a1" while
                 * carrying two plates and expects A-12 in the list.
                 *
                 * `LOWER(label) LIKE` rather than `ILIKE` so the same SQL runs
                 * on any driver, and a leading wildcard is affordable here in a
                 * way it would not be on a guest-facing endpoint: this scan is
                 * behind `tables.view`, inside one tenant, over a table that
                 * holds a few dozen rows per branch.
                 */
                AllowedFilter::callback('search', function ($query, $value): void {
                    $like = '%'.mb_strtolower((string) $value).'%';
                    $query->whereRaw('LOWER(label) LIKE ?', [$like]);
                }),
                AllowedFilter::callback('free', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->free();
                    }
                }),
            ])
            ->allowedSorts(['label', 'seats', 'position', 'created_at'])
            ->allowedIncludes(['hall'])
            /*
             * The plan's own order, then the label.
             *
             * `position` is 0 on every table nobody has placed, so a restaurant
             * that has never opened the layout editor gets exactly the
             * label-ordered list it got before — and one that has gets the room
             * as the host reads it, window to kitchen. Sorting by label alone
             * was why every plan had to be fixed by renaming tables.
             */
            ->defaultSort('position', 'label')
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

        // The room hears about it through the model's `updated` hook, on
        // `branch.{id}.floor` — not from here, because seating a reservation and
        // closing a bill move a table too and neither goes through this action.
        $table->update(['status' => $validated['status']]);

        return new RestaurantTableResource($table->refresh());
    }

    /**
     * The square to print and stick on the table.
     *
     * A GET, so a manager can open it, and it answers both halves: the URL, for
     * a console that would rather draw its own code or copy the link, and a
     * finished SVG for the print sheet. Neither is derivable from the other
     * outside this module — the base origin is the *guest* app's, not the API's,
     * and getting that wrong is not a redirect, it is two hundred wrong
     * stickers.
     *
     * `tables.view`, not `tables.manage`: the token is already printed on the
     * furniture of a public dining room, so a host who can see the floor plan
     * can see the code stuck to it. What is guarded is issuing a new one, and
     * nothing issues one — see `RestaurantTable::booted()`.
     */
    public function qr(RestaurantTable $table, TableQrCode $codes): JsonResponse
    {
        return response()->json([
            'data' => [
                'id' => $table->id,
                'label' => $table->label,
                'qr_token' => $table->qr_token,
                'qr_url' => $codes->url($table),
                'svg' => $codes->svg($table),
            ],
        ]);
    }
}
