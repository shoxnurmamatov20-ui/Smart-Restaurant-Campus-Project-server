<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/** No Finance module, no ledger — the honest figure is zero. */
final class UnavailableDayBook implements DayBook
{
    public function takingsToday(?int $branchId = null): int
    {
        return 0;
    }

    public function openSince(?int $branchId = null): ?\DateTimeImmutable
    {
        return null;
    }
}
