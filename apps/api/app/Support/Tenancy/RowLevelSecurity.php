<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Illuminate\Support\Facades\DB;

/**
 * The four statements that put a new table behind the tenancy policy.
 *
 * `2026_08_18_170000` swept every table that existed when it ran, and a table
 * created afterwards is not covered by it — RowLevelSecurityTest walks pg_class
 * and fails when one appears unguarded. That test tells you what is missing; a
 * migration still has to say the four statements, and four statements copied by
 * hand into every future module migration is four chances to copy three.
 *
 * The rule is identical to the sweep's, deliberately: bypass when the caller is
 * cross-tenant by nature, otherwise the row's tenant must match the request's,
 * and neither set means no rows. FORCE because the application connects as the
 * table owner and an owner walks past a merely ENABLED policy.
 */
final class RowLevelSecurity
{
    public const POLICY = 'tenant_isolation';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    /** Schema-qualified, e.g. `orders.order_item_modifiers`. */
    public static function guard(string ...$tables): void
    {
        foreach ($tables as $table) {
            DB::statement("alter table {$table} enable row level security");
            DB::statement("alter table {$table} force row level security");
            DB::statement('drop policy if exists '.self::POLICY." on {$table}");
            DB::statement(
                'create policy '.self::POLICY." on {$table} for all"
                .' using ('.self::RULE.') with check ('.self::RULE.')',
            );
        }
    }

    /** For a migration's down(), so a rollback leaves no orphan policy. */
    public static function release(string ...$tables): void
    {
        foreach ($tables as $table) {
            DB::statement('drop policy if exists '.self::POLICY." on {$table}");
            DB::statement("alter table {$table} no force row level security");
            DB::statement("alter table {$table} disable row level security");
        }
    }
}
