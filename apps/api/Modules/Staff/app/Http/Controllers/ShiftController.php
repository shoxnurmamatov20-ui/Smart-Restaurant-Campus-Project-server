<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Staff\Http\Requests\StoreShiftRequest;
use Modules\Staff\Http\Requests\UpdateShiftRequest;
use Modules\Staff\Http\Resources\ShiftResource;
use Modules\Staff\Models\Shift;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for shifts.
 *
 * Mounted under /api/v1/staff/shifts and gated by Spatie permission
 * middleware on the route definition (Modules/Staff/routes/api.php).
 */
final class ShiftController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Shift::class)
            ->allowedFilters([
                AllowedFilter::exact('member', 'staff_member_id'),
                AllowedFilter::exact('status'),
                AllowedFilter::callback('upcoming', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->upcoming();
                    }
                }),
            ])
            ->allowedSorts(['starts_at', 'created_at'])
            ->allowedIncludes(['member'])
            ->defaultSort('starts_at')
            ->paginate($perPage)
            ->withQueryString();

        return ShiftResource::collection($records);
    }

    public function store(StoreShiftRequest $request): ShiftResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Shift::create($request->validated())->refresh();

        return new ShiftResource($record->load('member'));
    }

    public function show(Shift $shift): ShiftResource
    {
        return new ShiftResource($shift->load('member'));
    }

    public function update(UpdateShiftRequest $request, Shift $shift): ShiftResource
    {
        $shift->update($request->validated());

        return new ShiftResource($shift->refresh()->load('member'));
    }

    public function destroy(Shift $shift): Response
    {
        $shift->delete();

        return response()->noContent();
    }
}
