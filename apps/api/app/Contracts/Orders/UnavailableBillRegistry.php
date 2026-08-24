<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

use Illuminate\Support\Carbon;
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

    public function servedBy(array $billIds): array
    {
        return [];
    }

    public function find(int $billId): ?Bill
    {
        return null;
    }

    /**
     * @param  array<int, int>  $modifierChoiceIds
     */
    public function addLine(
        int $billId,
        int $menuItemId,
        int $quantity = 1,
        ?int $unitPriceOverride = null,
        ?string $note = null,
        int $seatNo = 1,
        int $billNo = 1,
        array $modifierChoiceIds = [],
        ?string $servedBeforeStop = null,
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

    public function send(int $billId): Bill
    {
        $this->refuse();
    }

    /**
     * @param  array<int, int>  $lineIds
     */
    public function split(int $billId, array $lineIds): Bill
    {
        $this->refuse();
    }

    /**
     * @return array<int, Bill>
     */
    public function splitEvenly(int $billId, int $ways): array
    {
        $this->refuse();
    }

    /**
     * @return array<int, Bill>
     */
    public function splitAmount(int $billId, int $amountTiyin): array
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

    public function awaitPayment(int $billId): Bill
    {
        $this->refuse();
    }

    /**
     * Reads answer "nothing", writes refuse — and a delivery nobody can record
     * is a read that answers `false`. The courier's queue keeps the entry,
     * which is the whole reason this contract answers a boolean rather than
     * throwing: a rider's phone told "landed" would forget the drop.
     */
    public function markDelivery(int $billId, string $status, ?Carbon $at = null): bool
    {
        return false;
    }

    public function close(int $billId): Bill
    {
        $this->refuse();
    }

    public function markPrepaid(int $billId): Bill
    {
        $this->refuse();
    }

    public function reopen(int $billId, string $reason): Bill
    {
        $this->refuse();
    }

    /**
     * @return array<int, Bill>
     */
    public function openBillsOn(int $tableId): array
    {
        /*
         * Empty rather than a refusal, unlike every write on this class.
         *
         * This is a read, and "no Orders module" genuinely means "no open bills" —
         * there is nowhere for one to exist. Throwing would stop a floor plan from
         * drawing at all, when the honest picture is a room with no bills on it.
         */
        return [];
    }

    public function cancel(int $billId, string $reason): Bill
    {
        $this->refuse();
    }

    public function comp(int $billId, string $reason): Bill
    {
        $this->refuse();
    }

    public function refund(int $billId, string $reason): Bill
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
