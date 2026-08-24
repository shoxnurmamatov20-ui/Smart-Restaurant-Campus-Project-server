<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

/** The desk, when the CRM module is switched off: nothing is waiting. */
final class UnavailableCaseDesk implements CaseDesk
{
    public function openCount(?int $branchId = null): int
    {
        return 0;
    }
}
