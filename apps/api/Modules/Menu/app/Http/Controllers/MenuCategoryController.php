<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Menu\Http\Requests\StoreMenuCategoryRequest;
use Modules\Menu\Http\Requests\UpdateMenuCategoryRequest;
use Modules\Menu\Http\Resources\MenuCategoryResource;
use Modules\Menu\Models\MenuCategory;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for menu sections.
 *
 * Query parameters:
 *   ?filter[search]=salat      matches slug and every locale of the name
 *   ?filter[is_active]=1
 *   ?filter[root]=1            top-level sections only
 *   ?include=children,items
 *   ?sort=sort_order
 */
final class MenuCategoryController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 50), self::MAX_PER_PAGE);

        $categories = QueryBuilder::for(MenuCategory::class)
            ->allowedFilters([
                AllowedFilter::exact('slug'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::exact('parent_id'),
                AllowedFilter::callback('root', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->root();
                    }
                }),
                AllowedFilter::callback('search', function ($query, $value): void {
                    $like = '%'.mb_strtolower((string) $value).'%';
                    $query->where(function ($q) use ($like): void {
                        $q->whereRaw('LOWER(slug) LIKE ?', [$like])
                            ->orWhereRaw('LOWER(CAST(name AS TEXT)) LIKE ?', [$like]);
                    });
                }),
            ])
            ->allowedSorts(['slug', 'sort_order', 'created_at'])
            ->allowedIncludes(['children', 'items', 'parent'])
            ->withCount('items')
            ->defaultSort('sort_order')
            ->paginate($perPage)
            ->withQueryString();

        return MenuCategoryResource::collection($categories);
    }

    public function store(StoreMenuCategoryRequest $request): MenuCategoryResource
    {
        $category = MenuCategory::create($request->validated());

        return new MenuCategoryResource($category);
    }

    public function show(MenuCategory $category): MenuCategoryResource
    {
        return new MenuCategoryResource($category->load(['children', 'items']));
    }

    public function update(UpdateMenuCategoryRequest $request, MenuCategory $category): MenuCategoryResource
    {
        $category->update($request->validated());

        return new MenuCategoryResource($category);
    }

    public function destroy(MenuCategory $category): Response
    {
        $category->delete();

        return response()->noContent();
    }
}
