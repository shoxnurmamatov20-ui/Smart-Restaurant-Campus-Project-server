<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;

/**
 * Menu's side of the read contract.
 *
 * The only place in the codebase where another module's request for a dish
 * meets Eloquent. Everything crossing the boundary leaves as a
 * {@see Dish} — a value object with no relations, no lazy loads, and nothing
 * a caller could accidentally save.
 *
 * Tenant scoping is not applied here: MenuItem carries the BelongsToTenant
 * global scope already, so a caller can only ever see its own restaurant.
 */
final class EloquentMenuCatalog implements MenuCatalog
{
    public function find(int $id): ?Dish
    {
        $item = MenuItem::query()->find($id);

        return $item === null ? null : $this->toDish($item);
    }

    public function findBySku(string $sku): ?Dish
    {
        $item = MenuItem::query()->where('sku', $sku)->first();

        return $item === null ? null : $this->toDish($item);
    }

    /**
     * @return array<int, Section>
     */
    public function sellable(string $channel = 'dine_in'): array
    {
        return MenuCategory::query()
            ->active()
            ->root()
            ->with([
                'items' => fn ($query) => $query->orderable()->forChannel($channel)->orderBy('sort_order'),
            ])
            ->orderBy('sort_order')
            ->get()
            // A heading with nothing under it is noise on a phone screen.
            ->reject(fn (MenuCategory $category): bool => $category->items->isEmpty())
            ->map(fn (MenuCategory $category): Section => new Section(
                id: $category->id,
                slug: $category->slug,
                title: $category->title ?? $category->slug,
                dishes: $category->items->map(fn (MenuItem $item): Dish => $this->toDish($item))->all(),
            ))
            ->values()
            ->all();
    }

    private function toDish(MenuItem $item): Dish
    {
        return new Dish(
            id: $item->id,
            sku: $item->sku,
            // `title` is already resolved for the request locale, so a Russian
            // guest's bill prints Russian dish names.
            title: $item->title ?? $item->sku,
            description: $item->translate('description'),
            station: $item->station,
            price: $item->price,
            currency: $item->currency ?? 'UZS',
            isOrderable: $item->is_orderable,
            cookTimeMinutes: $item->cook_time_minutes,
            allergens: $item->allergens ?? [],
            kind: $item->kind,
            imageUrl: $item->image_url,
        );
    }
}
