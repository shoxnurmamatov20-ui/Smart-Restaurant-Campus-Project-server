<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

use RuntimeException;

/**
 * What the platform does when Orders is switched off.
 *
 * Reads answer "there is no such bill"; writes refuse loudly. The alternative —
 * a null object that silently pretends to open bills — would let a till take
 * money for orders that were never recorded, which is worse than an outage.
 *
 * Bound with `bindIf` in AppServiceProvider, so the real implementation wins
 * whenever Orders is installed.
 */
final class UnavailableBillRegistry implements BillRegistry
{
    public function open(
        string $channel,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
        ?int $customerId = null,
        int $guests = 1,
    ): Bill {
        $this->refuse();
    }

    public function find(int $billId): ?Bill
    {
        return null;
    }

    public function addLine(
        int $billId,
        int $menuItemId,
        int $quantity = 1,
        ?int $unitPriceOverride = null,
        ?string $note = null,
    ): Bill {
        $this->refuse();
    }

    public function voidLine(int $billId, int $lineId, string $reason): Bill
    {
        $this->refuse();
    }

    public function applyDiscount(int $billId, int $amountTiyin, string $reason): Bill
    {
        $this->refuse();
    }

    public function applyServiceCharge(int $billId, int $amountTiyin): Bill
    {
        $this->refuse();
    }

    public function send(int $billId): Bill
    {
        $this->refuse();
    }

    /**
     * @param array<int, int> $lineIds
     */
    public function split(int $billId, array $lineIds): Bill
    {
        $this->refuse();
    }

    public function merge(int $sourceBillId, int $targetBillId): Bill
    {
        $this->refuse();
    }

    public function transfer(
        int $billId,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
    ): Bill {
        $this->refuse();
    }

    public function close(int $billId): Bill
    {
        $this->refuse();
    }

    public function reopen(int $billId, string $reason): Bill
    {
        $this->refuse();
    }

    public function cancel(int $billId, string $reason): Bill
    {
        $this->refuse();
    }

    private function refuse(): never
    {
        throw new RuntimeException(
            'Buyurtmalar moduli o\'chirilgan — hisob ochib bo\'lmaydi. '.
            'Enable the Orders module before taking orders.',
        );
    }
}
