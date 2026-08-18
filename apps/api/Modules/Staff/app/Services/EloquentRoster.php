<?php

declare(strict_types=1);

namespace Modules\Staff\Services;

use App\Contracts\Staff\Roster;
use Modules\Staff\Models\Attendance;

/**
 * Who is at work right now, counted from attendance.
 *
 * An open attendance — checked in, not yet checked out — is the definition of
 * "on shift" everywhere else in the module, so it is the definition here too.
 * The rota (planned shifts) deliberately plays no part: the idle screen's
 * number answers "how many people are IN the building", and a shift that was
 * planned but not shown up for is exactly the difference this makes visible.
 */
final class EloquentRoster implements Roster
{
    public function onShiftCount(?int $branchId = null): int
    {
        return Attendance::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereNull('checked_out_at')
            ->count();
    }
}
