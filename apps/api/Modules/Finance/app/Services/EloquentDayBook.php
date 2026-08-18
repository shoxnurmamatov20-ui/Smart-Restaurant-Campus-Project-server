<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Finance\DayBook;
use App\Support\Tenancy\BusinessDay;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;

/**
 * Today's takings, where "today" is the trading day, not the calendar one.
 *
 * A payment row carries the business date it was stamped with at capture (Q3:
 * the 06:00 boundary), so the day filter is one indexed equality — no window
 * arithmetic at read time.
 *
 * Branch is the one join: payments do not carry branch_id (money belongs to a
 * shift, the shift to a till, the till to a branch), so a branch-scoped read
 * goes through the shifts that ran there. Captured only — refunded money went
 * back and is not takings.
 */
final class EloquentDayBook implements DayBook
{
    public function __construct(private readonly BusinessDay $businessDay) {}

    public function takingsToday(?int $branchId = null): int
    {
        return (int) Payment::query()
            ->where('business_date', $this->businessDay->dateFor())
            ->where('status', 'captured')
            ->when($branchId !== null, fn ($query) => $query->whereIn(
                'cash_shift_id',
                CashShift::query()->where('branch_id', $branchId)->select('id'),
            ))
            ->sum('amount');
    }
}
