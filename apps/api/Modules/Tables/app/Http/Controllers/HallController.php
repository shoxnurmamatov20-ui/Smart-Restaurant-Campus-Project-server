<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Tables\Http\Requests\StoreHallRequest;
use Modules\Tables\Http\Requests\UpdateHallRequest;
use Modules\Tables\Http\Resources\HallResource;
use Modules\Tables\Models\Hall;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for halls.
 *
 * Mounted under /api/v1/tables/halls and gated by Spatie permission
 * middleware on the route definition (Modules/Tables/routes/api.php).
 */
final class HallController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Hall::class)
            ->allowedFilters([
                AllowedFilter::exact('code'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('name'),
            ])
            ->allowedSorts(['code', 'name', 'sort_order', 'created_at'])
            ->allowedIncludes(['tables'])
            ->withCount(['tables'])
            ->defaultSort('sort_order')
            ->paginate($perPage)
            ->withQueryString();

        return HallResource::collection($records);
    }

    public function store(StoreHallRequest $request): HallResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Hall::create($request->validated())->refresh();

        return new HallResource($record->load('tables')->loadCount(['tables']));
    }

    public function show(Hall $hall): HallResource
    {
        return new HallResource($hall->load('tables')->loadCount(['tables']));
    }

    public function update(UpdateHallRequest $request, Hall $hall): HallResource
    {
        $hall->update($request->validated());

        return new HallResource($hall->refresh()->load('tables')->loadCount(['tables']));
    }

    public function destroy(Hall $hall): Response
    {
        $hall->delete();

        return response()->noContent();
    }
}
