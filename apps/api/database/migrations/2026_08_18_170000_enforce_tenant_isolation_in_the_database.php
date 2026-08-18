<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Row-level security on every table that carries a tenant_id.
 *
 * `BelongsToTenant` protects the queries that go through Eloquent, and only
 * those. One DB::table() in a report, one raw join in an export, one new
 * module whose author forgot the trait — and the query reads every restaurant
 * on the platform, with nothing to say so. This is the second belt: the same
 * rule, enforced by PostgreSQL, on queries nobody has written yet.
 *
 * The policy reads two session settings, written only by DatabaseTenancy:
 * `app.tenant_id` scopes the table to one restaurant, `app.bypass_tenancy`
 * opens it for the callers whose work is cross-tenant (console commands, the
 * outbox relay, the platform operator). With neither set the table answers NO
 * ROWS — the forgotten case is the safe case, and it fails loudly in the
 * first manual test rather than quietly in a breach report.
 *
 * FORCE, not just ENABLE: the application connects as the table owner, and an
 * owner bypasses ENABLE'd policies silently. FORCE is the difference between
 * having row security and appearing to.
 *
 * Discovered dynamically rather than listed, so the forty tables of today and
 * the module tables of next month get the same treatment; the architecture
 * suite (RowLevelSecurityTest) is what catches a new table that appears after
 * this migration ran.
 *
 * The exemptions are `public.users` and `pos.terminals`, and both are
 * load-bearing: auth:sanctum resolves a token's owner BEFORE the tenant
 * middleware has set any GUC. Guarded, the first makes every login on the
 * platform fail and the second makes every paired tablet answer 401. Both stay
 * under the Eloquent scope alone.
 */
return new class extends Migration
{
    /**
     * Tables that authentication itself has to read.
     *
     * Both are identity, and both are read by `auth:sanctum` before any
     * middleware has established which restaurant the request is for — so a
     * policy that authentication is what establishes cannot guard them. Users
     * for a person's token, terminals for a device's. Guarded, the first makes
     * every sign-in fail and the second makes every paired tablet 401.
     *
     * Neither holds money, guest data or personal data, and both keep the
     * Eloquent BelongsToTenant scope on every query the application makes.
     */
    private const EXEMPT = ['public.users', 'pos.terminals'];

    private const POLICY = 'tenant_isolation';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        foreach ($this->guardedTables() as $table) {
            DB::statement("alter table {$table} enable row level security");
            DB::statement("alter table {$table} force row level security");
            DB::statement('drop policy if exists '.self::POLICY." on {$table}");
            DB::statement(
                'create policy '.self::POLICY." on {$table} for all"
                .' using ('.self::RULE.') with check ('.self::RULE.')',
            );
        }
    }

    public function down(): void
    {
        foreach ($this->guardedTables() as $table) {
            DB::statement('drop policy if exists '.self::POLICY." on {$table}");
            DB::statement("alter table {$table} no force row level security");
            DB::statement("alter table {$table} disable row level security");
        }
    }

    /** @return list<string> */
    private function guardedTables(): array
    {
        $rows = DB::select(<<<'SQL'
            select c.table_schema || '.' || c.table_name as name
            from information_schema.columns c
            join information_schema.tables t
              on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.column_name = 'tenant_id'
              and t.table_type = 'BASE TABLE'
              and c.table_schema not in ('pg_catalog', 'information_schema')
            order by 1
        SQL);

        return array_values(array_filter(
            array_map(static fn (object $row): string => (string) $row->name, $rows),
            static fn (string $name): bool => ! in_array($name, self::EXEMPT, true),
        ));
    }
};
