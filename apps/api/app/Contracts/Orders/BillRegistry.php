<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

use RuntimeException;

/**
 * The one way to work on a bill from outside the Orders module.
 *
 * The POS is the reason this exists. A till has to open a bill, add lines to it,
 * split it between four guests, move it to another table and finally close it —
 * and if it did that by importing `Modules\Orders\Models\Order`, the two modules
 * could never be deployed or reasoned about separately, and every schema change
 * in Orders would be a change to the till.
 *
 * Everything here is expressed in ids and tiyin. Nothing leaks an Eloquent
 * model. Money is never accepted from the caller where it can be derived:
 * `addLine` takes a quantity and lets Orders decide the price, because a client
 * that can name its own price is a client that can undercharge.
 *
 * Implemented by Orders, resolved through the container, and always scoped to
 * the current restaurant by the caller's tenant context.
 */
interface BillRegistry
{
    /**
     * Open a new bill on a channel.
     *
     * @param string $channel One of dine_in|takeaway|delivery|aggregator.
     */
    public function open(
        string $channel,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
        ?int $customerId = null,
        int $guests = 1,
    ): Bill;

    /** One bill by id, or null if this restaurant has no such bill. */
    public function find(int $billId): ?Bill;

    /**
     * Add a dish to an open bill.
     *
     * The price is read from the catalogue and snapshotted onto the line.
     * `$unitPriceOverride` exists for happy-hour and manager price overrides and
     * is the only way a caller may set money directly.
     *
     * @throws RuntimeException when the bill is closed or the dish is unknown
     */
    public function addLine(
        int $billId,
        int $menuItemId,
        int $quantity = 1,
        ?int $unitPriceOverride = null,
        ?string $note = null,
    ): Bill;

    /**
     * Take a line off a bill, with a reason.
     *
     * Voiding is not deletion: the line is cancelled and stays visible, because
     * "which lines were removed, by whom, and why" is the single most useful
     * question in a restaurant fraud investigation.
     *
     * @throws RuntimeException when the bill is closed or the line is not on it
     */
    public function voidLine(int $billId, int $lineId, string $reason): Bill;

    /**
     * Apply a discount to the whole bill, in tiyin.
     *
     * @param int $amountTiyin Positive; it is subtracted from the total.
     *
     * @throws RuntimeException when the bill is closed or the discount exceeds the subtotal
     */
    public function applyDiscount(int $billId, int $amountTiyin, string $reason): Bill;

    /** Add a service charge, in tiyin. Replaces any previous one. */
    public function applyServiceCharge(int $billId, int $amountTiyin): Bill;

    /**
     * Send the bill to the kitchen.
     *
     * @throws RuntimeException when the bill has no lines or is already closed
     */
    public function send(int $billId): Bill;

    /**
     * Move some lines onto a new bill.
     *
     * The classic "four people, four cards" case. The new bill inherits the
     * table and the waiter; the original keeps whatever was not moved.
     *
     * @param array<int, int> $lineIds
     *
     * @throws RuntimeException when a line is not on the bill, or all lines would move
     */
    public function split(int $billId, array $lineIds): Bill;

    /**
     * Move every line from one bill onto another and close the source.
     *
     * @throws RuntimeException when either bill is closed
     */
    public function merge(int $sourceBillId, int $targetBillId): Bill;

    /**
     * Move a bill to another table, another waiter, or both.
     *
     * @throws RuntimeException when the bill is closed
     */
    public function transfer(
        int $billId,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
    ): Bill;

    /**
     * Mark the bill paid.
     *
     * Called only after money has actually been captured — Orders has no way to
     * check that, so the caller owns the ordering.
     *
     * @throws RuntimeException when the bill is already closed
     */
    public function close(int $billId): Bill;

    /**
     * Reopen a settled bill.
     *
     * Deliberately awkward: it exists because a guest sometimes orders one more
     * coffee after the card has gone through, and it is the single most abusable
     * operation in the module. Callers are expected to have a manager's
     * authorisation in hand before calling it.
     *
     * @throws RuntimeException when the bill was never closed
     */
    public function reopen(int $billId, string $reason): Bill;

    /** Cancel an open bill outright. */
    public function cancel(int $billId, string $reason): Bill;
}
