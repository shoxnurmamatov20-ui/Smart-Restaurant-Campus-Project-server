<?php

declare(strict_types=1);

namespace Modules\Suppliers\Services;

use App\Contracts\Suppliers\Receiving;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Models\Ingredient;
use Modules\Suppliers\Models\PurchaseOrder;

/**
 * The one place a purchase turns into stock.
 *
 * Lifted out of `PurchaseOrderController::receive()` rather than copied beside
 * it. Two callers now reach this — the purchasing screen, and a storekeeper's
 * phone draining `receive_confirm` through `POST /api/v1/staff/actions` — and a
 * second copy of "raise every line, close the order, grow the debt" is a second
 * copy that will eventually disagree about which of the three it does.
 *
 * The controller keeps the refusals, because a screen and a queue want
 * different answers to the same "no": the screen wants a 422 naming the reason
 * so a buyer can read it, and the queue wants a boolean so eleven other entries
 * still land. This method answers the boolean; the controller checks first and
 * throws its own `ApiException`.
 *
 * The Inventory import is the module's one recorded edge — see
 * `ModuleBoundaryTest::ALLOWED_EDGES`, "Receiving a delivery raises stock".
 * Moving the code here did not add an edge; it moved the one that was already
 * in the controller.
 */
final class EloquentReceiving implements Receiving
{
    public function confirm(int $purchaseOrderId, ?int $userId = null): bool
    {
        return DB::transaction(function () use ($purchaseOrderId): bool {
            /** @var PurchaseOrder|null $purchaseOrder */
            $purchaseOrder = PurchaseOrder::query()->lockForUpdate()->find($purchaseOrderId);

            /*
             * Locked and re-checked inside the transaction, not before it.
             *
             * Receiving twice doubles a van of stock on the shelf and doubles
             * the supplier's debt, and the two requests that would do it are a
             * storekeeper's queue draining while somebody at a desk taps
             * "Qabul qilish" — which is a real ten seconds, not a theoretical
             * race. `lockForUpdate` is what makes the status check hold.
             */
            if ($purchaseOrder === null || in_array($purchaseOrder->status, ['received', 'cancelled'], true)) {
                return false;
            }

            $this->post($purchaseOrder);

            return true;
        });
    }

    /**
     * The three writes, in the order an accountant would explain them.
     *
     * Called with the row already locked. Public callers go through
     * `confirm()`; the controller reaches this via `post()` after making its
     * own refusals, so the two doors cannot drift on what "received" does.
     *
     * @param array<int, int> $counted line id → base units actually counted; absent lines are received whole
     */
    public function post(PurchaseOrder $purchaseOrder, array $counted = []): void
    {
        foreach ($purchaseOrder->items as $line) {
            /*
             * What was counted, when somebody counted.
             *
             * Recorded on the line before the shelf is raised, and the shelf is
             * raised by the counted figure rather than the ordered one — two
             * kilos of beef that never arrived must not appear in stock. A line
             * nobody counted keeps `received_quantity` null and is received
             * whole, which is what every delivery signed for from a phone is.
             */
            $arrived = $counted[$line->id] ?? null;

            if ($arrived !== null) {
                $line->forceFill(['received_quantity' => $arrived])->save();
            }

            if ($line->ingredient_id === null) {
                continue;
            }

            $quantity = $arrived ?? $line->quantity;

            // A line counted at zero moves nothing. `Ingredient::move()` would
            // happily write a zero-quantity movement, and a ledger full of
            // them is a ledger nobody can read.
            if ($quantity === 0) {
                continue;
            }

            $ingredient = Ingredient::query()->find($line->ingredient_id);
            $ingredient?->move('receipt', $quantity, null, $purchaseOrder->number);
        }

        $arrivedAt = now();
        $purchaseOrder->update(['status' => 'received', 'received_at' => $arrivedAt]);

        $supplier = $purchaseOrder->supplier;

        if ($supplier !== null) {
            // Two writes, one condition apart. The delivery date is a fact
            // about every arrival; the debt only grows for a supplier who
            // invoices rather than being paid at the door.
            $grown = $supplier->payment_terms_days > 0
                ? $supplier->debt + $purchaseOrder->total
                : $supplier->debt;

            $supplier->forceFill([
                'debt' => $grown,
                'last_delivery_at' => $arrivedAt,
            ])->save();
        }
    }
}
