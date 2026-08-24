<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Board\Http\Controllers\Concerns\StandsAtOneVenue;
use Modules\Board\Http\Requests\ReorderBoardRequest;
use Modules\Board\Http\Requests\StoreBoardScreenRequest;
use Modules\Board\Http\Requests\UpdateBoardScreenRequest;
use Modules\Board\Http\Resources\BoardScreenResource;
use Modules\Board\Models\BoardScreen;
use Modules\Board\Services\BoardOrdering;

/**
 * The rotation — `/board/playlist`.
 *
 * The second tab. A row is either a screen that takes its turn for so many
 * seconds, or one that replaces the board between two hours and takes no turn
 * at all; the request classes hold that invariant and the database holds it
 * again, because a row that is both makes the console's "one full turn" figure
 * wrong all day.
 *
 * The route says `playlist` and the class says `Screen`: the resource is one
 * entry, and a controller named after the collection would have `PlaylistController::store()`
 * creating a second playlist rather than a row in the one that exists.
 */
final class BoardScreenController extends Controller
{
    use StandsAtOneVenue;

    public function index(): ResourceCollection
    {
        return BoardScreenResource::collection(
            BoardScreen::query()->inBoardOrder()->get(),
        );
    }

    public function store(StoreBoardScreenRequest $request): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        $attributes = $request->validated();

        // On the end, for the same reason a new column goes on the end. Null
        // from `max` is an empty board rather than position zero — the first
        // screen goes to 0, so a seeded venue and a hand-built one number the
        // same way.
        $last = BoardScreen::query()->max('position');
        $attributes['position'] ??= $last === null ? 0 : (int) $last + 1;

        $screen = BoardScreen::create($attributes);

        return (new BoardScreenResource($screen))->response()->setStatusCode(201);
    }

    public function update(UpdateBoardScreenRequest $request, BoardScreen $screen): BoardScreenResource
    {
        $screen->update($request->validated());

        return new BoardScreenResource($screen);
    }

    public function destroy(BoardScreen $screen): JsonResponse
    {
        $screen->delete();

        return response()->json(null, 204);
    }

    /**
     * The rotation, reordered in one write.
     *
     * The playlist gets this as well as the columns because the argument does
     * not change between them: a rotation half reordered is two screens
     * claiming the same slot, and the manager watching the wall sees the order
     * they asked for on one turn and not the next.
     */
    public function reorder(ReorderBoardRequest $request, BoardOrdering $ordering): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        $moved = $ordering->apply(BoardScreen::query(), $request->ids());

        return response()->json([
            'data' => [
                'reordered' => $moved,
                'playlist' => BoardScreenResource::collection(
                    BoardScreen::query()->inBoardOrder()->get(),
                ),
            ],
        ]);
    }
}
