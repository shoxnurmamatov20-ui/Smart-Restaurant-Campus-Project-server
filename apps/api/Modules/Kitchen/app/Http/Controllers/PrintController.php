<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Kitchen\Printing\EloquentPrintSpooler;

/**
 * Asking for a piece of paper again.
 *
 * Two actions, two different people, two different permissions — and the split
 * is the point. A cook whose docket jammed needs another one and must not be
 * able to produce a receipt; a cashier reprinting a guest's slip is handling a
 * money document and must not need the kitchen's rights to do it. `kitchen.update`
 * and `pos.sell` respectively, declared on the routes.
 */
final class PrintController extends Controller
{
    /**
     * The docket again, marked as a reprint.
     *
     * Marked because a cook who plates a reprint a second time has thrown away a
     * dish and the guest is still waiting. The banner also changes what the paper
     * hashes to, which is what stops the spool's duplicate guard from swallowing
     * the request as "already printed".
     */
    public function docket(KitchenTicket $ticket, EloquentPrintSpooler $spooler): JsonResponse
    {
        return response()->json($spooler->docket($ticket, reprint: true)->toArray(), 202);
    }

    /**
     * The guest's receipt again, marked as a copy.
     *
     * **Without the payment lines**, and that is a real limitation rather than an
     * oversight. How a bill was settled lives in Finance's payment rows, and there
     * is no contract to read them back by order — `TillLedger` writes them and
     * reports shift totals, and nothing exposes "what was tendered on bill 118".
     * So a copy shows what was ordered and what it came to, which is what somebody
     * asking for a duplicate almost always wants, and does not claim to show how
     * it was paid.
     *
     * The full copy needs a Finance read contract. Until it exists, the till's own
     * receipt at settlement is the only one carrying the tender lines — it has the
     * TenderPlan in hand at the moment it prints.
     */
    public function receipt(Request $request, BillRegistry $bills, EloquentPrintSpooler $spooler): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['required', 'integer'],
            'printer_id' => ['nullable', 'integer'],
        ]);

        $bill = $bills->find((int) $validated['order_id']);

        if ($bill === null) {
            return response()->json(['message' => 'Hisob topilmadi.'], 404);
        }

        return response()->json(
            $spooler->reprintReceipt($bill, printerId: $validated['printer_id'] ?? null)->toArray(),
            202,
        );
    }
}
