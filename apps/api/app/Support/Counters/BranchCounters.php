<?php

declare(strict_types=1);

namespace App\Support\Counters;

use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * Named, scoped, atomic counters — the only way this codebase issues numbers.
 *
 * `next()` is one round trip: INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 * The row lock serialises concurrent takers, so the guarantee is exactly the
 * database's, not this class's: consecutive values, no duplicates, under any
 * concurrency. There is deliberately no `peek()` — a value read without being
 * taken is a value two callers can both believe is theirs, which is the
 * max(id)+1 bug wearing a new coat.
 *
 * The caller inside a transaction holds the counter's row lock until commit.
 * That is correct — a rolled-back bill must give its number back — and it is
 * also why a counter key should be taken LAST, near the write it numbers, not
 * at the top of a long transaction.
 */
final class BranchCounters
{
    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * Take the next value of a counter, creating it at 1 on first use.
     *
     * @param string $key what is being counted — `order.number`, `zreport.number`
     * @param int|null $branchId null = one count for the whole restaurant
     * @param string $period '' = never resets; a Y-m-d date = that day's count
     */
    public function next(string $key, ?int $branchId = null, string $period = ''): int
    {
        $row = DB::selectOne(<<<'SQL'
            insert into branch_counters (tenant_id, branch_id, "key", period, value, created_at, updated_at)
            values (?, ?, ?, ?, 1, now(), now())
            on conflict (tenant_id, branch_id, "key", period)
            do update set value = branch_counters.value + 1, updated_at = now()
            returning value
        SQL, [$this->tenants->id(), $branchId, $key, $period]);

        return (int) $row->value;
    }
}
