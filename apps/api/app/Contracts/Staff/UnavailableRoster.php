<?php

declare(strict_types=1);

namespace App\Contracts\Staff;

/** With no Staff module there is no attendance, so nobody is "on shift". */
final class UnavailableRoster implements Roster
{
    public function onShiftCount(?int $branchId = null): int
    {
        return 0;
    }
}
