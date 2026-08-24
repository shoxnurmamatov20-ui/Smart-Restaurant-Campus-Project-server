<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Media\ImageRejected;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Modules\Menu\Http\Requests\StoreMenuItemRequest;
use Modules\Menu\Http\Requests\UpdateMenuItemRequest;
use Modules\Menu\Http\Requests\UploadMenuItemImageRequest;
use Modules\Menu\Http\Resources\MenuItemResource;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Services\DishImageStore;
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

    /**
     * The dish's photograph — `POST /v1/menu/items/{item}/image`, multipart.
     *
     * Its own endpoint rather than a field on the PATCH, and that is a decision
     * about failure rather than about tidiness. A menu edit is a form somebody
     * filled in; an upload is a file over a phone connection that drops halfway.
     * Folded together, a failed upload loses the price change typed above it,
     * and a successful price change re-sends eight megabytes that were already
     * stored.
     *
     * It carries `menu.update`, not `menu.create`: replacing the photograph of
     * a dish that already exists is editing it.
     *
     * The pipeline's refusals come back as 422 with a code from the catalogue.
     * They used to surface as 500s — a corrupt JPEG that passed the MIME check
     * reached the manager as "the system is broken" when the honest sentence
     * is "that file is broken, pick another".
     */
    public function image(UploadMenuItemImageRequest $request, MenuItem $item, DishImageStore $images): MenuItemResource
    {
        $file = $request->file('image');

        // Validation guarantees one file; this narrows the type for static
        // analysis, which cannot know that `file()` may also answer an array.
        abort_unless($file instanceof UploadedFile, 422, 'Rasm fayli yuborilmadi.');

        try {
            $record = $images->put($item, $file);
        } catch (ImageRejected $rejected) {
            throw ApiException::of('menu.image_'.$rejected->reason, field: 'image');
        }

        $item->update(['image' => $record]);

        // The column is kept in step for anything that reads the row without
        // going through the resource — an export, a report, psql. The resource
        // itself answers from the record, so a bucket that moves is not a stale
        // column on every menu.
        $item->update(['image_url' => $item->imageUrl()]);

        return new MenuItemResource($item->refresh());
    }

    /**
     * Take the photograph off a dish — `DELETE /v1/menu/items/{item}/image`.
     *
     * A manager who uploaded the wrong picture needs a way back that is not
     * "upload a different wrong picture". The files go too: a photograph
     * nothing points at is a file the bucket pays for until somebody lists it.
     *
     * 404 when there is nothing to remove, so a client that retries after a
     * lost response learns the first attempt landed.
     */
    public function removeImage(MenuItem $item, DishImageStore $images): MenuItemResource
    {
        if (! is_array($item->image) && $item->image_url === null) {
            throw ApiException::of('menu.image_missing');
        }

        $images->forget($item);

        $item->update(['image' => null, 'image_url' => null]);

        return new MenuItemResource($item->refresh());
    }
}
