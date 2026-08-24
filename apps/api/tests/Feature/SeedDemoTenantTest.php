<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Console\Commands\SeedDemoTenant;
use App\Support\Modules\ModuleRegistry;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Crm\Models\PromoCode;
use Modules\Orders\Database\Seeders\DemoTradingSeeder;
use Tests\TestCase;

/**
 * `demo:seed` is how the demo restaurant on a live box gets its fixtures
 * after a deploy — with the tenant set, so nothing lands as a `tenant_id IS
 * NULL` row that RLS then hides from everyone.
 *
 * The command is driven by each module's `demo` config, and that config is
 * prose until something reads it: a seeder class that was renamed, or a table
 * listed as `inventory.prep_item` instead of `prep_items`, fails on the live
 * box in the middle of a deploy evening. This runs the real thing against the
 * full demo set so the config is checked where the mistake is cheap.
 */
final class SeedDemoTenantTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_declared_seeder_and_table_exists(): void
    {
        $declared = $this->declared();

        $this->assertNotEmpty($declared, 'no module declares demo seeders');

        foreach ($declared as $seeder => $tables) {
            $this->assertTrue(class_exists($seeder), "{$seeder} is declared in a module's demo config but does not exist");

            foreach ($tables as $table) {
                $this->assertTrue(Schema::hasTable($table), "{$seeder} declares table {$table}, which does not exist");
            }
        }
    }

    public function test_the_demo_set_seeds_the_demo_tenant_without_orphans(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->artisan('demo:seed')->assertSuccessful();

        foreach ($this->declared() as $tables) {
            foreach ($tables as $table) {
                $this->assertSame(0, DB::table($table)->whereNull('tenant_id')->count(), "{$table} has tenantless rows after demo:seed");
            }
        }
    }

    public function test_the_demo_week_is_paid_waited_and_balanced(): void
    {
        // What the dashboard's "this week", the waiter leaderboard and the
        // cash book read: every one of the last seven days has paid bills
        // with a waiter and a business date, and the day's captured payments
        // add up to exactly what the bills say.
        $this->seed(DatabaseSeeder::class);
        $this->artisan('demo:seed')->assertSuccessful();

        DB::statement("set local app.bypass_tenancy = 'on'");

        for ($back = DemoTradingSeeder::DAYS - 1; $back >= 1; $back--) {
            $day = now()->startOfDay()->subDays($back)->toDateString();

            $bills = DB::table('orders.orders')->where('number', 'like', 'D%')->where('business_date', $day);

            $this->assertGreaterThan(0, (clone $bills)->count(), "no demo bills on {$day}");
            $this->assertSame(0, (clone $bills)->whereNull('waiter_user_id')->count(), "a demo bill on {$day} has no waiter");
            $this->assertSame(0, (clone $bills)->where('status', '!=', 'paid')->count(), "a demo bill on {$day} is not paid");

            $billed = (int) (clone $bills)->sum('total');
            $taken = (int) DB::table('finance.payments')->where('business_date', $day)->where('status', 'captured')
                ->whereIn('order_id', (clone $bills)->pluck('id'))->sum('amount');

            $this->assertSame($billed, $taken, "payments on {$day} do not add up to the bills");
            $this->assertSame(1, DB::table('finance.cash_shifts')->where('number', 'DZ-'.date('ymd', strtotime($day)))->where('status', 'closed')->count(), "no sealed till for {$day}");
        }
    }

    public function test_running_the_demo_set_twice_does_not_grow_it(): void
    {
        // The schedule runs `demo:seed` every morning on a box with a demo
        // tenant. A seeder that `create()`s without looking would double the
        // bookings, the rota and the stock ledger daily — this is the lock.
        $this->seed(DatabaseSeeder::class);

        $this->artisan('demo:seed')->assertSuccessful();
        $before = $this->rowCounts();

        $this->artisan('demo:seed')->assertSuccessful();
        $after = $this->rowCounts();

        $grew = array_filter($after, static fn (int $count, string $table): bool => $count !== $before[$table], ARRAY_FILTER_USE_BOTH);

        $this->assertSame([], $grew, 'A second demo:seed changed row counts in: '.json_encode($grew));
    }

    public function test_it_removes_rows_that_belong_to_no_tenant_before_seeding(): void
    {
        $this->seed(DatabaseSeeder::class);

        // What `db:seed --class` writes when nobody set a tenant: a row RLS
        // shows to no restaurant, and which a unique index then blocks the
        // real seed against.
        DB::statement("set local app.bypass_tenancy = 'on'");
        DB::table('crm.promo_codes')->insert([
            'tenant_id' => null,
            'code' => 'ORPHAN',
            'kind' => 'percent',
            'value' => 10,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->artisan('demo:seed', ['--only' => 'Modules\\Crm\\Database\\Seeders\\CrmPromoSeeder'])
            ->expectsOutputToContain('crm.promo_codes: removed 1 row(s)')
            ->assertSuccessful();

        $this->assertSame(0, DB::table('crm.promo_codes')->whereNull('tenant_id')->count());
        $this->assertGreaterThan(0, PromoCode::query()->count());
    }

    public function test_it_refuses_a_tenant_that_is_not_a_demo(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->artisan('demo:seed', ['--slug' => 'osh-markazi'])
            ->expectsOutputToContain('Refusing')
            ->assertFailed();
    }

    /** @return array<string, int> */
    private function rowCounts(): array
    {
        $counts = [];

        foreach ($this->declared() as $tables) {
            foreach ($tables as $table) {
                $counts[$table] = DB::table($table)->count();
            }
        }

        return $counts;
    }

    /** @return array<class-string, list<string>> */
    private function declared(): array
    {
        $found = [];

        foreach (app(ModuleRegistry::class)->all() as $module) {
            foreach ((array) config("{$module->key}.demo.seeders", []) as $seeder) {
                $found[$seeder] = (array) config("{$module->key}.demo.tables", []);
            }
        }

        $this->assertInstanceOf(SeedDemoTenant::class, app(SeedDemoTenant::class));

        return $found;
    }
}
