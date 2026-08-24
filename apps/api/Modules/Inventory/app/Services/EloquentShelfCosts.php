<?php

declare(strict_types=1);

namespace Modules\Inventory\Services;

use App\Contracts\Inventory\ShelfComponent;
use App\Contracts\Inventory\ShelfCosts;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\PrepItem;

/**
 * The shelf, priced, for whoever is costing a recipe.
 *
 * Two queries at most and never one per line. A technical card is read on a
 * screen that lists every costed dish at once, so an implementation that looked
 * each component up individually would be forty queries for a menu of ten
 * dishes — and the caller cannot batch on its behalf, because it holds ids and
 * not models.
 *
 * Tenancy is the global scope's, not this file's. `Ingredient` and `PrepItem`
 * both carry `BelongsToTenant`, so an id belonging to another restaurant simply
 * does not come back — which lands in the "absent" case the contract already
 * describes, rather than needing a check that could be forgotten.
 */
final class EloquentShelfCosts implements ShelfCosts
{
    /**
     * @param  list<int>  $ids
     * @return array<int, ShelfComponent>
     */
    public function ingredients(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return Ingredient::query()
            ->whereIn('id', $ids)
            ->get(['id', 'name', 'unit', 'cost_per_unit'])
            ->mapWithKeys(static fn (Ingredient $item): array => [
                $item->id => new ShelfComponent(
                    $item->id,
                    $item->name,
                    $item->unit,
                    $item->cost_per_unit,
                ),
            ])
            ->all();
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, ShelfComponent>
     */
    public function prepItems(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return PrepItem::query()
            // The components are what `unit_cost` is derived from, and an
            // unloaded relation answers zero rather than slowly — which would
            // put a zirvak line on a plov card at no cost at all.
            ->with('components.ingredient')
            ->whereIn('id', $ids)
            ->get()
            ->mapWithKeys(static fn (PrepItem $item): array => [
                $item->id => new ShelfComponent(
                    $item->id,
                    // Trilingual, resolved for the reader by HasTranslations.
                    $item->translate('name') ?? $item->code,
                    $item->unit,
                    // Per USABLE unit, after loss — see the contract.
                    $item->unit_cost,
                ),
            ])
            ->all();
    }
}
