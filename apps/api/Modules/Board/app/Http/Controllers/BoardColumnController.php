<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Board\Http\Controllers\Concerns\StandsAtOneVenue;
use Modules\Board\Http\Requests\ReorderBoardRequest;
use Modules\Board\Http\Requests\StoreBoardColumnRequest;
use Modules\Board\Http\Requests\UpdateBoardColumnRequest;
use Modules\Board\Http\Resources\BoardColumnResource;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Services\BoardOrdering;

/**
 * Which menu sections the wall draws, and in what order.
 *
 * The first of the console's three tabs. A row here is a heading and a place in
 * the row of headings — never a dish and never a price; see
 * `BoardComposer` for where those come from and why they are not here.
 *
 * Not paginated, and that is a decision rather than an omission. A wall fits
 * three or four columns before the text at the back of the queue is unreadable,
 * so the list is short by physics; a `?page=2` on a screen whose whole purpose
 * is to show the reader the order of things would be a way of hiding half of it.
 */
final class BoardColumnController extends Controller
{
    use StandsAtOneVenue;

    public function index(): ResourceCollection
    {
        // No branch means every venue's columns, which is what an owner
        // comparing two counters wants. The writes below refuse it — see
        // StandsAtOneVenue for why a null branch_id is not "no venue".
        $columns = BoardColumn::query()->inBoardOrder()->get();

        return BoardColumnResource::collection($columns);
    }

    public function store(StoreBoardColumnRequest $request): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        $attributes = $request->validated();

        /*
         * A new column goes on the end unless told otherwise.
         *
         * Defaulting `position` to 0 would put every new heading first and
         * silently tie it with whatever is already there — the tie-break is
         * `id`, so the newest column would appear second and the manager who
         * added it would go looking for the arrows.
         */
        $last = BoardColumn::query()->max('position');
        $attributes['position'] ??= $last === null ? 0 : (int) $last + 1;

        $column = BoardColumn::create($attributes);

        return (new BoardColumnResource($column))->response()->setStatusCode(201);
    }

    public function update(UpdateBoardColumnRequest $request, BoardColumn $column): BoardColumnResource
    {
        $column->update($request->validated());

        return new BoardColumnResource($column);
    }

    public function destroy(BoardColumn $column): JsonResponse
    {
        /*
         * Hard delete, unlike an order or a payment.
         *
         * Convention 7 keeps money and bills forever because somebody may have
         * to answer for them later. A board column is a display setting: nobody
         * audits which heading was third last March, and a soft-deleted row here
         * would only be a `deleted_at` every query has to remember to filter.
         */
        $column->delete();

        return response()->json(null, 204);
    }

    /**
     * The arrows, in one write.
     *
     * See ReorderBoardRequest for why the whole list travels together and why a
     * partial one is refused rather than partly applied.
     */
    public function reorder(ReorderBoardRequest $request, BoardOrdering $ordering): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        $moved = $ordering->apply(BoardColumn::query(), $request->ids());

        return response()->json([
            'data' => [
                'reordered' => $moved,
                'columns' => BoardColumnResource::collection(
                    BoardColumn::query()->inBoardOrder()->get(),
                ),
            ],
        ]);
    }
}
