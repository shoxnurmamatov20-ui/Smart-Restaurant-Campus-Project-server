<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Modules\Marketplace\Http\Requests\UpdateCatalogueRequest;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;

/**
 * Which dishes go on the market, and what they cost there.
 *
 * The screen shows two prices side by side — what the dining room charges and
 * what the marketplace charges — because a marketplace order carries packaging,
 * a courier and 9% that a table does not. What is STORED is the difference
 * between them, and that is the decision worth reading the migration for: a
 * markup keeps tracking when the house price moves, and a second stored price
 * silently stops.
 *
 * The whole catalogue is read through `MenuCatalog`. This module imports no Menu
 * model and names no Menu table, which is what lets a restaurant rename a dish
 * without the marketplace noticing.
 */
final class MerchantCatalogueController extends Controller
{
    /**
     * GET /api/v1/marketplace/catalogue
     *
     * Every sellable dish, with its market row beside it — including the dishes
     * that are NOT on the market. A screen that listed only what was already
     * listed would have no way to add anything.
     */
    public function index(MenuCatalog $menu): JsonResponse
    {
        $store = $this->store();

        $listed = [];

        foreach ($store->items()->get() as $row) {
            $listed[(int) $row->menu_item_id] = $row;
        }

        $rows = [];

        /** @var Section $section */
        foreach ($menu->sellable('delivery') as $section) {
            foreach ($section->dishes as $dish) {
                $item = $listed[$dish->id] ?? null;

                $rows[] = [
                    'menu_item_id' => $dish->id,
                    'title' => $dish->title,
                    'section' => $section->title,
                    'house_price_tiyin' => $dish->price,
                    'markup_tiyin' => $item instanceof StoreItem ? $item->markup_tiyin : 0,
                    'market_price_tiyin' => $item instanceof StoreItem
                        ? $item->marketPrice($dish->price)
                        : $dish->price,
                    // Absent from the market table reads as "not listed", which
                    // is the honest default: a restaurant joining the platform
                    // chooses what to put in the window rather than finding its
                    // entire menu already there.
                    'is_listed' => $item instanceof StoreItem && $item->is_listed,
                ];
            }
        }

        return response()->json([
            'data' => $rows,
            'meta' => ['commission_percent' => $store->commission_percent],
        ]);
    }

    /**
     * PATCH /api/v1/marketplace/catalogue
     *
     * A batch, because the screen is a table somebody edits and then saves. One
     * request per row would make "list these nine dishes" nine chances to fail
     * halfway and leave the window half dressed.
     *
     * The caller may send either `markup_tiyin` or `market_price_tiyin`; the
     * second is converted against today's house price. Both are offered because
     * the screen shows the market price and a merchant thinks in it, while the
     * column stores the difference for the reason in the class docblock.
     */
    public function update(UpdateCatalogueRequest $request, MenuCatalog $menu): JsonResponse
    {
        $store = $this->store();

        /** @var array<int, array<string, mixed>> $rows */
        $rows = $request->validated('items');

        foreach ($rows as $row) {
            $dish = $menu->find((int) $row['menu_item_id']);

            if ($dish === null) {
                throw ApiException::of('marketplace.dish_unavailable', field: 'items', meta: [
                    'menu_item_id' => (int) $row['menu_item_id'],
                ]);
            }

            $markup = array_key_exists('markup_tiyin', $row)
                ? (int) $row['markup_tiyin']
                : (array_key_exists('market_price_tiyin', $row)
                    ? (int) $row['market_price_tiyin'] - $dish->price
                    : null);

            $store->items()->updateOrCreate(
                ['menu_item_id' => $dish->id],
                array_filter([
                    'markup_tiyin' => $markup,
                    'is_listed' => $row['is_listed'] ?? null,
                    'sort_order' => $row['sort_order'] ?? null,
                ], static fn (mixed $value): bool => $value !== null),
            );
        }

        return $this->index($menu);
    }

    /**
     * This restaurant's storefront.
     *
     * Found by the policies rather than by an id in the URL — a merchant
     * request is already scoped to one tenant, so `first()` can only ever
     * answer their own. A restaurant that has not been given a storefront yet
     * gets a clear refusal instead of an empty list it would read as "no
     * dishes".
     */
    private function store(): Store
    {
        $store = Store::query()->first();

        if ($store === null) {
            throw ApiException::of('marketplace.no_storefront');
        }

        return $store;
    }
}
