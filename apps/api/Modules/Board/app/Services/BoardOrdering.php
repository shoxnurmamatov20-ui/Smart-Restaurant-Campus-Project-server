<?php

declare(strict_types=1);

namespace Modules\Board\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Putting a list in an order, in one write.
 *
 * Columns and the playlist are the same problem twice — an ordered list of rows
 * belonging to one venue, dragged about by a person — so the arithmetic lives
 * here once. It is the arithmetic, not the endpoint, that is worth sharing: two
 * copies of "assign 0..n-1 and hope" drift, and the way that shows up is two
 * rows at position 3 on one of the two tabs.
 *
 * "One write" means one TRANSACTION, not one statement. A board has a handful
 * of columns, so the statement count is nobody's problem; what matters is that
 * a reorder cannot be half applied. N separate requests is N chances to stop in
 * the middle and leave two rows at position 3 — inside a transaction, either
 * every row moves or none does, and a dropped connection leaves the board
 * exactly as the manager last saw it.
 */
final class BoardOrdering
{
    /**
     * Assign positions 0..n-1 in the order given.
     *
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query  the venue's rows, already tenant- and branch-scoped
     * @param  array<int, int>  $ids  the ids, in the order they should be drawn
     * @return int how many rows were positioned
     *
     * @throws ValidationException when the list is not exactly this venue's rows
     */
    public function apply(Builder $query, array $ids): int
    {
        /** @var array<int, int> $existing */
        $existing = $query->clone()->pluck('id')->map(static fn ($id): int => (int) $id)->all();

        $this->refuseAnythingButTheWholeList($existing, $ids);

        if ($ids === []) {
            return 0;
        }

        DB::transaction(function () use ($query, $ids): void {
            foreach ($ids as $position => $id) {
                $query->clone()->whereKey($id)->update([
                    'position' => $position,
                    /*
                     * Stamped by hand, because a mass `update()` bypasses
                     * Eloquent's timestamps. Without it the rows would still
                     * look published after a reorder, so the console would tell
                     * a manager the wall was up to date at the exact moment it
                     * had stopped being.
                     */
                    'updated_at' => now(),
                ]);
            }
        }, 3);

        return count($ids);
    }

    /**
     * @param  array<int, int>  $existing
     * @param  array<int, int>  $given
     */
    private function refuseAnythingButTheWholeList(array $existing, array $given): void
    {
        sort($existing);
        $sorted = $given;
        sort($sorted);

        if ($existing === $sorted) {
            return;
        }

        /*
         * A partial or foreign list, refused rather than partly applied.
         *
         * Refusing is the whole point of doing this in one call: applying the
         * ids it recognises would leave the rows it did not name holding
         * positions the named ones were just given, which is the two-rows-at-3
         * this endpoint exists to prevent. It also catches the more likely
         * mistake — an id from another venue, or from another restaurant, which
         * the branch scope has already hidden from `$existing`.
         */
        throw ValidationException::withMessages([
            'ids' => "Tartib ro'yxati shu filialning barcha qatorlarini, bittadan, o'z ichiga olishi kerak.",
        ]);
    }
}
