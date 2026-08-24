<?php

declare(strict_types=1);

namespace App\Contracts\Suppliers;

/**
 * Receiving when the Suppliers module is not installed: refuse.
 *
 * The same shape as `UnavailableStockLedger` and for the same reason. A phone
 * told its confirmation landed clears that entry from its queue, and a van's
 * worth of stock then exists nowhere — on no shelf, in no debt, and in no
 * journal anybody will read. A refusal keeps the entry.
 */
final class UnavailableReceiving implements Receiving
{
    public function confirm(int $purchaseOrderId, ?int $userId = null): bool
    {
        return false;
    }
}
