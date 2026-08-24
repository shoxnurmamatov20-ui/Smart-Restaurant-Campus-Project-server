<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Contracts\Inventory\ShelfComponent;
use App\Contracts\Inventory\ShelfCosts;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\RecipeLine;

/**
 * Technical cards: what a dish is made of, and what that costs today.
 *
 * Two doors onto one calculation. `index()` is the chef's screen — every costed
 * dish at once, with its margin — and `show()` is one card in full. They share
 * `cards()` rather than the second calling the first, because the difference
 * that matters is the QUERY: reading fifty cards must not be fifty round trips
 * to the shelf, and reading one must not walk the whole menu.
 *
 * ---------------------------------------------------------------------------
 * Nothing here is stored
 *
 * `menu_items.cost_price` is a column and this endpoint does not read it. That
 * is the point: a stored food cost is a number that stops being true the next
 * time beef gets more expensive, and until now it was the ONLY number the
 * platform had — typed into a form, then quoted by the margin column, the ABC
 * report and the P&L as though a recipe stood behind it.
 *
 * So the total is summed from the lines every time, against what the shelf
 * costs right now. A dish with no card comes back with no lines and a null
 * cost, which the screen draws as "not costed" — never as a 100% margin.
 *
 * ---------------------------------------------------------------------------
 * A line whose component has gone
 *
 * `ShelfCosts` omits an id that no longer resolves — an ingredient somebody
 * deleted, a prep card retired. The line is still sent, with `name: null` and
 * no cost, and the card says how many such lines it has. A card that quietly
 * dropped them would report a cheaper dish than the kitchen makes.
 */
final class RecipeController extends Controller
{
    public function index(ShelfCosts $shelf): JsonResponse
    {
        /*
         * Only dishes that have a card.
         *
         * A menu of eighty items where four are costed should answer four rows,
         * not eighty with seventy-six empty ones: the screen is a list somebody
         * picks from, and padding it with dishes nobody has costed buries the
         * ones they have. "How many are still uncosted" is a different question
         * and the menu screen already answers it.
         */
        $items = MenuItem::query()
            ->with('recipeLines')
            ->has('recipeLines')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $this->cards($items->all(), $shelf)]);
    }

    public function show(MenuItem $item, ShelfCosts $shelf): JsonResponse
    {
        $item->load('recipeLines');

        return response()->json(['data' => $this->cards([$item], $shelf)[0]]);
    }

    /**
     * The cards, costed in two queries however many dishes there are.
     *
     * Every component id from every dish is collected first and resolved in one
     * pass per kind. The naive shape — resolve while mapping — is two queries
     * per dish, which on the chef's screen is a hundred round trips for a menu
     * nobody would call large.
     *
     * @param list<MenuItem> $items
     *
     * @return list<array<string, mixed>>
     */
    private function cards(array $items, ShelfCosts $shelf): array
    {
        $lines = [];

        foreach ($items as $item) {
            foreach ($item->recipeLines as $line) {
                $lines[] = $line;
            }
        }

        $ingredients = $shelf->ingredients($this->idsOf($lines, 'ingredient_id'));
        $prep = $shelf->prepItems($this->idsOf($lines, 'prep_item_id'));

        return array_map(
            fn (MenuItem $item): array => $this->card($item, $ingredients, $prep),
            $items,
        );
    }

    /**
     * @param list<RecipeLine> $lines
     *
     * @return list<int>
     */
    private function idsOf(array $lines, string $column): array
    {
        $ids = [];

        foreach ($lines as $line) {
            $id = $line->{$column};

            if (is_int($id)) {
                $ids[$id] = $id;
            }
        }

        return array_values($ids);
    }

    /**
     * @param array<int, ShelfComponent> $ingredients
     * @param array<int, ShelfComponent> $prep
     *
     * @return array<string, mixed>
     */
    private function card(MenuItem $item, array $ingredients, array $prep): array
    {
        $rows = [];
        $cost = 0;
        $unresolved = 0;

        foreach ($item->recipeLines as $line) {
            $isPrep = $line->prep_item_id !== null;
            $component = $isPrep
                ? ($prep[$line->prep_item_id] ?? null)
                : ($ingredients[$line->ingredient_id] ?? null);

            if ($component === null) {
                $unresolved++;
            }

            // Integer arithmetic all the way. `quantity` is base units and the
            // cost is tiyin per base unit, so the product is tiyin — the same
            // rule every amount on this platform follows.
            $lineCost = $component === null ? null : $line->quantity * $component->costPerUnitTiyin;
            $cost += $lineCost ?? 0;

            $rows[] = [
                'id' => $line->id,
                'kind' => $isPrep ? 'prep' : 'raw',
                'component_id' => $isPrep ? $line->prep_item_id : $line->ingredient_id,
                'name' => $component?->name,
                'unit' => $component?->unit,
                'quantity' => $line->quantity,
                'unit_cost_tiyin' => $component?->costPerUnitTiyin,
                'line_cost_tiyin' => $lineCost,
            ];
        }

        $sell = $item->price;

        return [
            'menu_item_id' => $item->id,
            'name' => $item->title,
            'sell_tiyin' => $sell,
            /*
             * Null when a line could not be priced.
             *
             * A partial total is worse than none: it looks like a food cost and
             * is guaranteed too low, and "too low" is the direction that makes a
             * dish look worth keeping. The screen shows the lines it does have
             * and says how many it could not price.
             */
            'cost_tiyin' => $unresolved > 0 ? null : $cost,
            'unresolved_lines' => $unresolved,
            /*
             * Margin as a percentage of the menu price — the way a menu is
             * priced — with food cost the same figure the other way up, which is
             * how a chef reads it. Rounded to whole percent because a card
             * quoting 63.4% invites an argument about the fourth line's yield.
             */
            'margin_percent' => $this->share($sell, $sell - $cost, $unresolved),
            'food_cost_percent' => $this->share($sell, $cost, $unresolved),
            'lines' => $rows,
        ];
    }

    /** A percentage of the sell price, or null when the card cannot answer. */
    private function share(int $sell, int $part, int $unresolved): ?int
    {
        if ($sell <= 0 || $unresolved > 0) {
            return null;
        }

        return (int) round($part * 100 / $sell);
    }
}
