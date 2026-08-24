<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\ModifierQuestion;
use App\Contracts\Menu\Section;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The menu, as a till needs it.
 *
 * Two reads rather than one, and the split is the whole design of this
 * controller. A waiter opens the till once a shift and taps dishes for the next
 * eight hours; they open a modifier sheet for maybe one line in five. So the
 * board comes down whole — every sellable dish in every section, one request —
 * and the questions for a dish come down when somebody taps it.
 *
 * Carrying the questions on every dish would be the obvious thing and it would
 * be a hundred joins to answer a sheet that is opened twenty times. Making the
 * board lazy per section would be worse: a waiter switching category mid-order
 * would wait on a network they may not have.
 *
 * Everything comes through App\Contracts\Menu. The POS may not import Menu's
 * models, and this is where that rule earns itself.
 *
 * The board is `board()` and not `sellable()`, which is the one deliberate
 * difference from every guest-facing reader of the menu. A guest offered a dish
 * the kitchen cannot cook is a guest who orders it, so `sellable()` removes it. A
 * waiter shown the same dish crossed out knows the answer to "do you have Manti"
 * without walking to the pass — and knows they have not misremembered the menu,
 * which is what a silently missing tile makes them think.
 */
final class PosMenuController extends Controller
{
    public function __construct(private readonly MenuCatalog $menu) {}

    /**
     * Everything this till should draw on this channel, in sections.
     *
     * The channel matters: a delivery-only dish must not appear on a dine-in
     * till, and a dine-in-only one must not reach an aggregator.
     *
     * Dishes the kitchen has 86'd come down with `is_stopped: true` rather than
     * being left out — see the class note. The line is still refused if anything
     * tries to sell one, by the registry, which checks the sheet itself.
     */
    public function index(Request $request): JsonResponse
    {
        $channel = (string) $request->query('channel', 'dine_in');

        $sections = $this->menu->board($channel);

        return response()->json([
            'channel' => $channel,
            'sections' => array_map(
                static fn (Section $section): array => $section->toArray(),
                $sections,
            ),
            // What the till would otherwise count itself, and get wrong the
            // first time a section is empty.
            'meta' => [
                'sections' => count($sections),
                'dishes' => array_sum(array_map(
                    static fn (Section $section): int => count($section->dishes),
                    $sections,
                )),
            ],
        ]);
    }

    /**
     * What the guest is asked about one dish.
     *
     * Answers 200 with an empty list for a dish nobody is asked anything about,
     * which is most of them — the till opens the sheet only when the list is
     * non-empty, so "no questions" and "add it straight to the cart" are the
     * same answer and need no second status.
     */
    public function questions(int $menuItem): JsonResponse
    {
        $dish = $this->menu->find($menuItem);

        if (! $dish instanceof Dish) {
            return response()->json(['data' => []], 404);
        }

        return response()->json([
            'dish' => $dish->toArray(),
            'questions' => array_map(
                static fn (ModifierQuestion $question): array => $question->toArray(),
                $this->menu->questionsFor($menuItem),
            ),
        ]);
    }
}
