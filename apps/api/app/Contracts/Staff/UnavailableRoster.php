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

    /**
     * No attendance, no payroll — and zero is the honest answer rather than a
     * refusal, matching the count above. A venue running without Staff pays its
     * people somewhere this platform cannot see, and a labour percentage of
     * zero renders as a blank card rather than as a claim.
     */
    public function payrollBetween(string $from, string $to, ?int $branchId = null): int
    {
        return 0;
    }

    /**
     * No attendance, no hours — and an EMPTY map rather than twenty-four zeros.
     *
     * The difference is what the caller draws. A chart handed twenty-four zeros
     * renders a flat line along the bottom, which reads as "nobody worked
     * today"; handed nothing, it can say the venue has no attendance to chart.
     *
     * @return array<int, int>
     */
    public function payrollByHour(string $from, string $to, ?int $branchId = null): array
    {
        return [];
    }

    public function hoursBetween(string $from, string $to, ?int $branchId = null): array
    {
        return [];
    }
}
