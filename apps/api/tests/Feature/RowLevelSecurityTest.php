<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The second belt: PostgreSQL enforcing tenancy on queries Eloquent never saw.
 *
 * Every read here is a RAW query on purpose — DB::table(), no model, no
 * global scope. That is exactly the query class BelongsToTenant cannot
 * protect, and exactly what these policies exist for. If a test in this file
 * fails, the failure mode it is defending against is one restaurant reading
 * another's rows through a report, an export, or a forgotten scope.
 */
final class RowLevelSecurityTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $palov;

    private Tenant $lagmon;

    protected function setUp(): void
    {
        parent::setUp();

        $this->palov = $this->tenant('palov-uyi');
        $this->lagmon = $this->tenant('lagmon-uyi');

        // Two counters, one per restaurant, planted under bypass. The table is
        // chosen for having the fewest NOT NULL columns of any guarded table —
        // these tests are about visibility, not about counters.
        $this->db()->bypass();
        DB::table('branch_counters')->insert([
            ['tenant_id' => $this->palov->id, 'key' => 'rls.probe', 'period' => '', 'value' => 1],
            ['tenant_id' => $this->lagmon->id, 'key' => 'rls.probe', 'period' => '', 'value' => 1],
        ]);
    }

    protected function tearDown(): void
    {
        // Session settings survive RefreshDatabase's rollback — they are not
        // transactional. Put the console default back so the next test's
        // factories are not silently fail-closed.
        $this->db()->bypass();

        parent::tearDown();
    }

    private function db(): DatabaseTenancy
    {
        return app(DatabaseTenancy::class);
    }

    private function tenant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @return list<int> */
    private function visibleTenantIds(): array
    {
        return DB::table('branch_counters')
            ->where('key', 'rls.probe')
            ->pluck('tenant_id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    public function test_a_focused_connection_sees_one_restaurant_only(): void
    {
        $this->db()->focus($this->palov->id);

        $this->assertSame([$this->palov->id], $this->visibleTenantIds());
    }

    public function test_an_unset_connection_sees_nothing_at_all(): void
    {
        // Fail closed: the forgotten case — a request that never resolved a
        // tenant — must read nothing, not everything. This is the single most
        // important assertion in the file.
        DB::select("select set_config('app.tenant_id', '', false), set_config('app.bypass_tenancy', '', false)");

        $this->assertSame([], $this->visibleTenantIds());
    }

    public function test_bypass_sees_the_whole_platform(): void
    {
        $this->db()->bypass();

        $this->assertEqualsCanonicalizing(
            [$this->palov->id, $this->lagmon->id],
            $this->visibleTenantIds(),
        );
    }

    public function test_a_focused_connection_cannot_write_another_restaurants_row(): void
    {
        $this->db()->focus($this->palov->id);

        // WITH CHECK is the write half of the policy. Without it a scoped
        // request could still INSERT rows stamped with someone else's tenant —
        // invisible to itself, poison to them. The attempt runs inside its own
        // savepoint so the violation aborts the forgery, not the test
        // harness's wrapping transaction.
        try {
            DB::transaction(fn () => DB::table('branch_counters')->insert([
                'tenant_id' => $this->lagmon->id, 'key' => 'rls.forged', 'period' => '', 'value' => 1,
            ]));

            $this->fail('A row for another restaurant was accepted.');
        } catch (QueryException $refusal) {
            $this->assertStringContainsString('row-level security', $refusal->getMessage());
        }

        // And nothing landed — checked with everything visible.
        $this->db()->bypass();
        $this->assertSame(0, DB::table('branch_counters')->where('key', 'rls.forged')->count());
    }

    public function test_the_policies_bind_the_table_owner_too(): void
    {
        // The application connects as the table owner, and an owner walks
        // straight past ENABLE'd policies. FORCE is what makes the previous
        // four tests mean anything — this asserts it stayed.
        $forced = DB::selectOne(
            "select relforcerowsecurity as f from pg_class where oid = to_regclass('public.branch_counters')",
        );

        $this->assertTrue((bool) $forced->f);
    }

    public function test_every_guarded_table_is_actually_guarded(): void
    {
        // The migration discovers tables dynamically, so a module table
        // created AFTER it ran is exactly the gap this closes. If this test
        // names your new table: add the four statements from the
        // 2026_08_18_170000 migration to your module's migration —
        // enable + force row level security, and the tenant_isolation policy.
        $unguarded = DB::select(<<<'SQL'
            select c.table_schema || '.' || c.table_name as name
            from information_schema.columns c
            join information_schema.tables t
              on t.table_schema = c.table_schema and t.table_name = c.table_name
            join pg_class pc
              on pc.oid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
            where c.column_name = 'tenant_id'
              and t.table_type = 'BASE TABLE'
              and c.table_schema not in ('pg_catalog', 'information_schema')
              and (not pc.relrowsecurity or not pc.relforcerowsecurity)
            order by 1
        SQL);

        $names = array_map(static fn (object $row): string => (string) $row->name, $unguarded);

        // users is exempt because auth:sanctum resolves the token's user
        // before any GUC exists — guarded, every login on the platform fails.
        $this->assertSame(['public.users'], $names, sprintf(
            'Tables carrying tenant_id without forced row-level security: %s',
            implode(', ', $names),
        ));
    }
}
