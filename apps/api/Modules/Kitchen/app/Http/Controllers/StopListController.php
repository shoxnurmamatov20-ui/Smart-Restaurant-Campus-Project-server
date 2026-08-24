<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Contracts\Menu\StoppedDish;
use App\Http\Controllers\Controller;
use App\Support\Errors\ErrorResponse;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * The 86 sheet, from the wall screen.
 *
 * In Kitchen and not in Menu, on purpose. A chef holds `kitchen.*` and must not
 * hold `menu.update` — that would be a cook who can change prices — but taking a
 * dish off tonight is exactly a cook's decision and theirs to make. So the
 * permission is the kitchen's and the write goes through
 * `App\Contracts\Menu\StopList`, which is the reason that contract exists: this
 * controller may not import a Menu model, and `ModuleBoundaryTest` enforces it.
 *
 * Branch-scoped by the request, and a request with no branch is refused rather
 * than guessed at. "Off everywhere" is a different act with a different audit
 * trail, and a chef tapping a screen in Chilonzor never means it.
 */
final class StopListController extends Controller
{
    public function __construct(
        private readonly StopList $stops,
        private readonly MenuCatalog $menu,
        private readonly BranchContext $branches,
    ) {}

    /**
     * The whole sheet: every dish this kitchen could stop, and which are off.
     *
     * One read rather than two, because the screen it feeds is one list. A chef
     * opens the sheet to take something off, and the thing they are looking for is
     * by definition not on the stop-list yet — so an endpoint that answered only
     * with what is already stopped would answer the wrong question and force the
     * screen to ask `menu.view` for the rest, which is a permission the kitchen
     * does not hold and should not.
     */
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->sheet()]);
    }

    /**
     * 86 a dish.
     *
     * `until` is optional and it is what a kitchen actually wants: "no more lamb
     * until the evening delivery" comes back on the clock with nobody having to
     * remember it.
     */
    public function store(Request $request): JsonResponse
    {
        if (! $this->branches->hasBranch()) {
            return ErrorResponse::code('request.branch_required', field: 'X-Branch');
        }

        $validated = $request->validate([
            'menu_item_id' => ['required', 'integer', 'min:1'],
            'reason' => ['nullable', 'string', 'max:200'],
            'until' => ['nullable', 'date', 'after:now'],
        ]);

        $changed = $this->stops->stop(
            (int) $validated['menu_item_id'],
            $validated['reason'] ?? null,
            isset($validated['until']) ? Carbon::parse($validated['until']) : null,
        );

        /*
         * 200 either way, and the body says which.
         *
         * `changed: false` means the dish was already off on the same terms —
         * usually a second cook tapping the same tile a moment later, which is not
         * an error and must not look like one on a wall screen. What a client does
         * with it is skip the toast; the sheet it gets back is the same regardless,
         * so the screen is correct even when the tap did nothing.
         */
        return response()->json(['changed' => $changed, 'data' => $this->sheet()]);
    }

    /** Put it back on. */
    public function destroy(int $menuItem): JsonResponse
    {
        if (! $this->branches->hasBranch()) {
            return ErrorResponse::code('request.branch_required', field: 'X-Branch');
        }

        return response()->json([
            'changed' => $this->stops->clear($menuItem),
            'data' => $this->sheet(),
        ]);
    }

    /**
     * Every dish, with why it is off if it is.
     *
     * `board()` rather than `sellable()`: the sheet has to list what is already
     * stopped, and `sellable()` is defined as the menu with exactly those removed.
     *
     * Dine-in only. A kitchen cooks what a kitchen cooks — a dish sold on delivery
     * and not in the room is still made on the same grill by the same cook, so
     * filtering the sheet by channel would hide dishes the person reading it is
     * standing in front of.
     *
     * @return array<int, array<string, mixed>>
     */
    private function sheet(): array
    {
        $detail = [];

        foreach ($this->stops->current() as $stopped) {
            $detail[$stopped->dishId] = $stopped;
        }

        $sheet = [];

        foreach ($this->menu->board() as $section) {
            foreach ($section->dishes as $dish) {
                $stop = $detail[$dish->id] ?? null;

                $sheet[] = [
                    'dish_id' => $dish->id,
                    'title' => $dish->title,
                    'station' => $dish->station ?? 'hot',
                    'section' => $section->title,
                    'is_stopped' => $dish->isStopped,
                    'reason' => $stop instanceof StoppedDish ? $stop->reason : null,
                    'until' => $stop instanceof StoppedDish ? $stop->until?->toIso8601String() : null,
                    'stopped_by' => $stop instanceof StoppedDish ? $stop->stoppedBy : null,
                    'since' => $stop instanceof StoppedDish ? $stop->since->toIso8601String() : null,
                ];
            }
        }

        return $sheet;
    }
}
