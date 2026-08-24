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

    /**
     * When the till that is open now was opened — or null when none is.
     *
     * The console's strip says "Shift open · 11:24" over every screen, and
     * for a week it said it from the catalogue, to a restaurant that had not
     * opened a till in its life. A time, not a shift: a caller that needs the
     * drawer is doing cash work and belongs behind `/api/v1/finance` with
     * its permission checks. With several venues and no branch given, the
     * earliest open one — the restaurant has been trading since then.
     */
    public function openSince(?int $branchId = null): ?\DateTimeImmutable;
}
