<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Printing\PrintSpooler;
use App\Http\Controllers\Controller;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;

/**
 * "Qayta urinish" — the till's own button for a printer that came back.
 *
 * The status strip has drawn this button since it was designed and could not
 * wire it, and its comment named the obstacle exactly: *"a retry is a WRITE:
 * either `POST /kitchen/print-jobs/{job}/retry` (`kitchen.update`) or
 * `POST /kitchen/printers/{printer}/test` (`kitchen.manage`), and a cashier's
 * role holds neither. A button that always answered 'reconnected' would be
 * worse than no button: it is a cashier walking away from a printer that is
 * still dead."*
 *
 * So this is a till-side door carrying `pos.sell`, reaching the queue through
 * `App\Contracts\Printing\PrintSpooler` rather than through Kitchen's own
 * routes — a module may not import another, and a cashier has no business
 * holding a permission that also lets them reconfigure the hardware.
 *
 * ---------------------------------------------------------------------------
 * What it does and does not touch
 *
 * Only `failed` jobs, and only at this till's venue. A `queued` job is already
 * being retried by the backoff; a `claimed` one is in an agent's hands and
 * re-queueing it prints the same receipt twice. See
 * `PrintSpooler::requeueFailed()`.
 *
 * The answer is a count, because the count is the honest thing to show: "4 ta
 * chek qayta navbatga qo'yildi" tells a cashier what happened, and zero tells
 * them the paper was not the problem.
 */
final class PrintQueueController extends Controller
{
    use ResolvesTillContext;

    public function __invoke(Request $request, PrintSpooler $spooler, BranchContext $branches): JsonResponse
    {
        /*
         * The terminal's own venue first, and the header only as a fallback.
         *
         * A till is bolted to a counter in one building, and that building is
         * what the person pressing this is standing in. Trusting `X-Branch`
         * alone would let a tablet re-queue another venue's paper by sending a
         * different header — harmless in intent and confusing in practice, since
         * the receipts would print in a room nobody is in.
         */
        $branchId = $this->terminal($request)->branch_id ?? $branches->id();

        $moved = $spooler->requeueFailed($branchId === null ? null : (int) $branchId);

        return response()->json([
            'data' => [
                'requeued' => $moved,
                'branch_id' => $branchId === null ? null : (int) $branchId,
            ],
        ]);
    }
}
