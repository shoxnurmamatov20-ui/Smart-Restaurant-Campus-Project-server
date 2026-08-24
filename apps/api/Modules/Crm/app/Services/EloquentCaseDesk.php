<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use App\Contracts\Crm\CaseDesk;
use Modules\Crm\Models\ComplaintCase;

final class EloquentCaseDesk implements CaseDesk
{
    public function openCount(?int $branchId = null): int
    {
        return ComplaintCase::query()
            ->whereIn('status', ['open', 'in_progress'])
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->count();
    }
}
