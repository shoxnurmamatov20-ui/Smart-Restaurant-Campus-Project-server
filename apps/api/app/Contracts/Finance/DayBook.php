<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/**
 * The trading day's takings, for surfaces that are not the cash desk.
 *
 * The POS idle screen shows "Savdo 18.4M" for the current business day —
 * which starts at 06:00, not midnight, so this cannot be a naive date filter
 * done by the caller. The Finance module owns that boundary (Q3) and answers
 * through here.
 *
 * Captured money only: a refunded payment's money went back, so it is not
 * takings. Amounts are integer tiyin like every other money in the platform.
 */
interface DayBook
{
    /**
     * Today's captured takings in tiyin, today being the current business day.
     * Null branch = the whole restaurant.
     */
    public function takingsToday(?int $branchId = null): int;
}
