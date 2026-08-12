<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Modules\Menu\Http\Requests\StoreMenuItemRequest;
use Modules\Menu\Http\Requests\UpdateMenuItemRequest;
use Modules\Menu\Http\Resources\MenuItemResource;
use Modules\Menu\Models\MenuItem;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for menu items (dishes, drinks, combos).
 *
 * All endpoints live under /api/v1/menu/items and are gated by Spatie
 * permission middleware on the route definition (Modules/Menu/routes/api.php).
 *
 * Query parameters (Spatie QueryBuilder conventions):
 *   ?filter[search]=osh              matches SKU and every locale of the name
 *   ?filter[category]=3              exact menu_category_id
 *   ?filter[station]=grill           kitchen station
 *   ?filter[kind]=drink              food | drink | combo | other
 *   ?filter[status]=active           draft | active | archived
 *   ?filter[orderable]=1             only what can be sold right now
 *   ?filter[channel]=delivery        offered on this sales channel
 *   ?sort=price / -price / sort_order
 *   ?per_page=50                     max 100
 *   ?include=category                eager-load the section
 */
final class MenuItemController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $items = QueryBuilder::for(MenuItem::class)
            ->allowedFilters([
                AllowedFilter::exact('sku'),
                AllowedFilter::exact('category', 'menu_category_id'),
                AllowedFilter::exact('station'),
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('is_vegetarian'),
                AllowedFilter::callback('orderable', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->orderable();
                    }
                }),
                AllowedFilter::callback('channel', function ($query, $value): void {
                    $query->forChannel((string) $value);
                }),
                AllowedFilter::callback('search', function ($query, $value): void {
                    $like = '%'.mb_strtolower((string) $value).'%';
                    $query->where(function ($q) use ($like): void {
                        $q->whereRaw('LOWER(sku) LIKE ?', [$like])
                            ->orWhereRaw('LOWER(CAST(name AS TEXT)) LIKE ?', [$like]);
                    });
                }),
            ])
            ->allowedSorts(['sku', 'price', 'cook_time_minutes', 'sort_order', 'created_at'])
            ->allowedIncludes(['category'])
            ->defaultSort('sort_order')
            ->paginate($perPage)
            ->withQueryString();

        return MenuItemResource::collection($items);
    }

    public function store(StoreMenuItemRequest $request): MenuItemResource
    {
        $item = MenuItem::create($request->validated());

        return new MenuItemResource($item->load('category'));
    }

    public function show(MenuItem $item): MenuItemResource
    {
        return new MenuItemResource($item->load('category'));
    }

    public function update(UpdateMenuItemRequest $request, MenuItem $item): MenuItemResource
    {
        $item->update($request->validated());

        return new MenuItemResource($item->load('category'));
    }

    public function destroy(MenuItem $item): Response
    {
        $item->delete();

        return response()->noContent();
    }

    /**
     * Put a dish on the stop-list — an ingredient ran out or the grill is down.
     *
     * Optional `until` (ISO-8601) makes it come back on its own, which is what
     * a kitchen actually wants for "no more lamb until the evening delivery".
     */
    public function stop(Request $request, MenuItem $item): MenuItemResource
    {
        $validated = $request->validate([
            'until' => ['nullable', 'date', 'after:now'],
        ]);

        $item->stop(
            isset($validated['until']) ? Carbon::parse($validated['until']) : null
        );

        return new MenuItemResource($item->refresh());
    }

    /** Take a dish off the stop-list. */
    public function resume(MenuItem $item): MenuItemResource
    {
        $item->resume();

        return new MenuItemResource($item->refresh());
    }
}
