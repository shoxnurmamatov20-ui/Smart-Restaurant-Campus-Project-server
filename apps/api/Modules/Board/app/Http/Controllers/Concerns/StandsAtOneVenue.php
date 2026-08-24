<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers\Concerns;

use App\Support\Errors\ErrorResponse;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;

/**
 * A board is a wall in one room, so a write to it names the room.
 *
 * Everywhere else on this API an absent `X-Branch` means "all of them" — that
 * is how an owner and an accountant read the business, and `BranchIsolationTest`
 * holds the line on it. The reads here follow that rule: an owner listing the
 * boards of five venues is a sensible question with a sensible answer.
 *
 * The writes cannot. `BelongsToBranch` stamps `branch_id` from the context and
 * leaves it null when there is none, and a null `branch_id` on this table does
 * not mean "no venue" — it means EVERY venue, because that is how the scope
 * reads it back. A column added without a branch would appear on every wall in
 * the chain, and the only symptom would be a heading in Termiz that nobody in
 * Termiz put there.
 *
 * The same applies to a push and to the preview: "which wall" has no honest
 * answer for a request that named none, and `StopList::stoppedItemIds()`
 * already answers an empty list without a branch — so a preview would quietly
 * show nothing dimmed rather than admit it did not know which kitchen.
 */
trait StandsAtOneVenue
{
    /** The refusal, or null when a venue was named. */
    private function refuseWithoutABranch(): ?JsonResponse
    {
        if (app(BranchContext::class)->hasBranch()) {
            return null;
        }

        return ErrorResponse::code('request.branch_required', field: 'X-Branch');
    }

    private function branchId(): ?int
    {
        return app(BranchContext::class)->id();
    }
}
