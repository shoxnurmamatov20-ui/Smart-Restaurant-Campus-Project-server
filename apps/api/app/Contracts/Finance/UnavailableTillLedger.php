<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use RuntimeException;

/**
 * What the platform does when Finance is switched off.
 *
 * Reads answer "nothing"; anything that would move money refuses. A till that
 * quietly accepted payments into a module that is not running would be taking
 * cash off guests with no record of it.
 */
final class UnavailableTillLedger implements TillLedger
{
    public function openShift(int $userId, int $openingCash = 0): int
    {
        $this->refuse();
    }

    public function openShiftFor(int $userId): ?int
    {
        return null;
    }

    public function closeShift(int $shiftId, int $countedCash, ?string $note = null): ShiftTotals
    {
        $this->refuse();
    }

    public function capture(int $shiftId, int $orderId, string $orderNumber, Tender $tender): int
    {
        $this->refuse();
    }

    public function refund(int $paymentId, string $reason): bool
    {
        $this->refuse();
    }

    public function recordCashOut(int $shiftId, int $amount, string $description): int
    {
        $this->refuse();
    }

    public function shiftTotals(int $shiftId): ShiftTotals
    {
        $this->refuse();
    }

    /**
     * @return array<int, string>
     */
    public function methods(): array
    {
        return [];
    }

    private function refuse(): never
    {
        throw new RuntimeException(
            'Moliya moduli o\'chirilgan — to\'lov qabul qilib bo\'lmaydi. '.
            'Enable the Finance module before taking money.',
        );
    }
}
