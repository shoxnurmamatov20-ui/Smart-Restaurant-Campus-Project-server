<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;

/**
 * What one storefront actually sells, and for how much.
 *
 * The join between two things that must not know each other:
 * `marketplace.store_items` says WHICH dishes are on the market and what is
 * added to their price, and `MenuCatalog` says what a dish is called, what it
 * costs in the dining room and whether the kitchen has run out of it. Menu is
 * read entirely through the contract — this module imports no Menu model and
 * touches no Menu table, which is what `ModuleBoundaryTest` checks and what lets
 * either side move.
 *
 * ---------------------------------------------------------------------------
 * `board()` for browsing, `sellable()` for buying
 *
 * The two catalogue methods differ by one thing — whether a dish the kitchen has
 * run out of is included — and the marketplace needs both, for the two different
 * questions its two callers ask.
 *
 * A guest reading a menu is shown the stopped dish, crossed out. That is
 * `board()`, and it is the same choice a till makes: somebody who never sees
 * "Somsa" concludes the restaurant does not make it and does not come back,
 * while somebody who sees it greyed out knows to try tomorrow. `soldOut` on the
 * design's `MpDish` is the same flag.
 *
 * A basket being priced is checked against `sellable()`, which has already
 * dropped them. That is what stops an order being taken for food nobody can
 * cook — and it has to be the server's check rather than the screen's, because
 * a stale page and an edited request both arrive looking identical.
 *
 * This was one method reading `find()` for both, and `find()` answers
 * `isStopped: false` unconditionally — the contract says so in as many words.
 * So every stopped dish was drawn as available and could be ordered.
 *
 * ---------------------------------------------------------------------------
 * One catalogue call, not one per dish
 *
 * Both methods read a whole section list once and index it. A storefront lists
 * thirty or forty dishes; `find()` per row is thirty or forty round trips for a
 * screen that is opened on every visit to the marketplace.
 *
 * Every method here has to be called inside the store's own tenancy —
 * `StorefrontDirectory::asStore()` — because `MenuCatalog` is scoped by the
 * caller's tenant context and would otherwise answer for whoever the request
 * happened to be, or for nobody.
 */
final readonly class StoreCatalogue
{
    /**
     * The channel the marketplace buys on.
     *
     * `delivery` rather than `dine_in`, and it is a real filter: a restaurant
     * decides per dish which channels it is offered on, and soup in a paper cup
     * is the reason. Asking for the dine-in board would put dishes in the shop
     * window that the restaurant has already said do not travel.
     */
    private const CHANNEL = 'delivery';

    public function __construct(private MenuCatalog $menu) {}

    /**
     * The market menu: one entry per listed dish, priced for the marketplace.
     *
     * A listed row whose dish has been withdrawn from the catalogue is dropped
     * silently — that is not a state to render, it is a stale row, and the
     * merchant's catalogue screen is where it gets cleaned up.
     *
     * Each row carries its SECTION as well as its dish, and that is not
     * decoration: the store screen groups the menu under chips — "Asosiy",
     * "Kabob", "Salat" — and without a section every client has to invent one.
     * Both of them did, from the dish's own title, which put one dish under
     * each chip and made the filter empty the list.
     *
     * @return array<int, array{item: StoreItem, dish: Dish, section: string, price: int}>
     */
    public function listing(Store $store): array
    {
        $sections = [];
        $board = [];

        foreach ($this->menu->board(self::CHANNEL) as $section) {
            foreach ($section->dishes as $dish) {
                $board[$dish->id] = $dish;
                $sections[$dish->id] = $section->title;
            }
        }

        $rows = [];

        foreach ($store->items()->where('is_listed', true)->orderBy('sort_order')->orderBy('id')->get() as $item) {
            $dish = $board[$item->menu_item_id] ?? null;

            if (! $dish instanceof Dish) {
                continue;
            }

            $rows[] = [
                'item' => $item,
                'dish' => $dish,
                'section' => $sections[$item->menu_item_id] ?? '',
                'price' => $item->marketPrice($dish->price),
            ];
        }

        return $rows;
    }

    /**
     * Price one dish for this storefront, or null if it cannot be bought here.
     *
     * Null covers four different refusals on purpose: the dish is not listed on
     * the market, the catalogue has never heard of it, the restaurant has
     * withdrawn it, or the kitchen has run out. All four mean the same thing to
     * a basket — you cannot buy this tonight — and separating them would tell a
     * stranger which dish ids exist.
     *
     * @return array{dish: Dish, price: int}|null
     */
    public function priceFor(Store $store, int $menuItemId): ?array
    {
        /** @var StoreItem|null $item */
        $item = $store->items()->where('menu_item_id', $menuItemId)->where('is_listed', true)->first();

        if (! $item instanceof StoreItem) {
            return null;
        }

        // `sellable()`, not `board()`: this is the buying path, and a stopped
        // dish has already been dropped from it.
        $dish = $this->indexed($this->menu->sellable(self::CHANNEL))[$menuItemId] ?? null;

        if (! $dish instanceof Dish) {
            return null;
        }

        return ['dish' => $dish, 'price' => $item->marketPrice($dish->price)];
    }

    /**
     * How long the kitchen says this basket takes, in minutes.
     *
     * The longest dish, not the sum: a kitchen cooks in parallel, and adding the
     * times would quote fifty minutes for a plov and a tea. The store's own
     * delivery window is added on top by the caller — that part is the road, not
     * the stove.
     *
     * @param array<int, int> $menuItemIds
     */
    public function prepMinutes(array $menuItemIds): int
    {
        $longest = 0;

        foreach ($menuItemIds as $id) {
            $longest = max($longest, $this->menu->prepMinutes($id));
        }

        return $longest;
    }

    /**
     * Sections flattened to a dish-by-id map.
     *
     * @param array<int, Section> $sections
     *
     * @return array<int, Dish>
     */
    private function indexed(array $sections): array
    {
        $dishes = [];

        foreach ($sections as $section) {
            foreach ($section->dishes as $dish) {
                $dishes[$dish->id] = $dish;
            }
        }

        return $dishes;
    }
}
