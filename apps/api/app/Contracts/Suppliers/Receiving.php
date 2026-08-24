<?php

declare(strict_types=1);

namespace App\Contracts\Suppliers;

/**
 * Confirming that a delivery actually arrived, from outside the Suppliers module.
 *
 * One verb, and it is the heaviest one in that module: it raises stock on every
 * line, closes the purchase order, and grows the supplier's debt when they
 * invoice rather than being paid at the door. Three writes in one transaction,
 * which is exactly why nobody else may reimplement it.
 *
 * It exists because a storekeeper confirms a delivery on a phone at the service
 * entrance, where the signal is worst in the building. That confirmation queues
 * locally and drains through `POST /api/v1/staff/actions` as `receive_confirm`,
 * and Staff may not import Suppliers — `ModuleBoundaryTest` records exactly one
 * edge into Inventory, from Suppliers, and none into Suppliers at all.
 *
 * Answers a boolean rather than throwing, like `StockLedger` and `FloorPlan`
 * and for the same reason: the caller is a batch of twelve entries, and one
 * that cannot land must come back as one refusal beside the eleven that worked.
 * `false` means there is no such order in this restaurant, or it was already
 * received or cancelled — none of which the phone should keep retrying.
 */
interface Receiving
{
    /**
     * The van came, the boxes were counted, the order is closed.
     *
     * Idempotent by refusal rather than by repetition: a second call for an
     * order that is already `received` answers `false` and moves no stock. That
     * matters more here than anywhere else on this contract surface — receiving
     * twice would double a delivery on the shelf and double the debt, and a
     * stock-take three weeks later is where anybody would find out.
     *
     * `$userId` is who confirmed it. Recorded on the activity log rather than
     * on the order, because the storekeeper who signs for a van is a fact about
     * the afternoon, not a column the purchasing screen reads.
     */
    public function confirm(int $purchaseOrderId, ?int $userId = null): bool;
}
