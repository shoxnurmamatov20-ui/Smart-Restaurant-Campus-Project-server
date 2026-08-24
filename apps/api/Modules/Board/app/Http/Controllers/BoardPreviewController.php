<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Board\Http\Controllers\Concerns\StandsAtOneVenue;
use Modules\Board\Services\BoardComposer;

/**
 * What a customer standing at the counter is looking at — `GET board/preview`.
 *
 * The console draws half its board screen from this, and that half is not
 * decoration. The wall hangs in a different room from whoever configures it, so
 * without a picture of what it currently says a mistake — a column in the wrong
 * order, a banner still running from last month — lives until somebody walks
 * past the counter and happens to look up.
 *
 * It is also what the screens themselves read after a `board.pushed` arrives on
 * their channel, which is why the shape is the whole board rather than a diff:
 * a television has nothing to reconcile a diff against.
 *
 * The prices and the dimming in here are Menu's, read live through the
 * contracts. See BoardComposer.
 */
final class BoardPreviewController extends Controller
{
    use StandsAtOneVenue;

    public function __invoke(BoardComposer $composer): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        return response()->json([
            'data' => $composer->compose((int) $this->branchId()),
        ]);
    }
}
