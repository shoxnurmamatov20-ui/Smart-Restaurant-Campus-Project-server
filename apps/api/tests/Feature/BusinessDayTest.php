<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\Payment;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * When "today" starts and ends for a restaurant.
 *
 * Both halves of this matter. The arithmetic decides which Z-report a 02:00 bill
 * lands on — a real question for every venue that serves past midnight. The SQL
 * shape decides whether the query can use an index, which is the difference
 * between a dashboard that answers and one that hangs.
 */
final class BusinessDayTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => 'osh-markazi',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
            'settings' => ['business_day_starts_at' => '06:00'],
        ]);

        app(TenantContext::class)->set($this->tenant);
    }

    private function businessDay(): BusinessDay
    {
        return app(BusinessDay::class);
    }

    // ============ The trading day ============

    public function test_the_day_runs_from_the_restaurants_own_opening_hour(): void
    {
        // 14:00 in Tashkent on the 11th.
        [$start, $end] = $this->businessDay()->window(
            CarbonImmutable::parse('2026-08-11 09:00:00', 'UTC'),
        );

        // 06:00 Tashkent = 01:00 UTC.
        $this->assertSame('2026-08-11 01:00:00', $start->toDateTimeString());
        $this->assertSame('2026-08-12 01:00:00', $end->toDateTimeString());
    }

    public function test_a_bill_settled_after_midnight_belongs_to_the_evening_that_is_closing(): void
    {
        // 02:00 Tashkent on the 12th — the kitchen is cleaning down, not opening.
        [$start, $end] = $this->businessDay()->window(
            CarbonImmutable::parse('2026-08-11 21:00:00', 'UTC'),
        );

        $this->assertSame('2026-08-11 01:00:00', $start->toDateTimeString());
        $this->assertSame('2026-08-12 01:00:00', $end->toDateTimeString());
    }

    public function test_the_boundary_belongs_to_exactly_one_day(): void
    {
        // Exactly 06:00 Tashkent is the first moment of the new trading day.
        [$start] = $this->businessDay()->window(
            CarbonImmutable::parse('2026-08-11 01:00:00', 'UTC'),
        );

        $this->assertSame('2026-08-11 01:00:00', $start->toDateTimeString());

        // One second earlier is still yesterday.
        [$earlier] = $this->businessDay()->window(
            CarbonImmutable::parse('2026-08-11 00:59:59', 'UTC'),
        );

        $this->assertSame('2026-08-10 01:00:00', $earlier->toDateTimeString());
    }

    public function test_a_restaurant_that_opens_at_a_different_hour_gets_a_different_day(): void
    {
        $this->tenant->update(['settings' => ['business_day_starts_at' => '10:00']]);
        app(TenantContext::class)->set($this->tenant->fresh());

        [$start] = $this->businessDay()->window(
            CarbonImmutable::parse('2026-08-11 09:00:00', 'UTC'),   // 14:00 Tashkent
        );

        // 10:00 Tashkent = 05:00 UTC.
        $this->assertSame('2026-08-11 05:00:00', $start->toDateTimeString());
    }

    public function test_a_restaurant_that_never_configured_one_still_gets_a_sensible_day(): void
    {
        $this->tenant->update(['settings' => []]);
        app(TenantContext::class)->set($this->tenant->fresh());

        $this->assertSame('06:00', $this->businessDay()->startsAt());
    }

    public function test_a_reservation_diary_uses_the_calendar_day_not_the_trading_day(): void
    {
        // A host looking at "the 11th" means the 11th on the wall: a 00:30
        // booking is shown on the date the guest chose.
        [$start, $end] = $this->businessDay()->calendarDay('2026-08-11');

        // Midnight Tashkent = 19:00 UTC the day before.
        $this->assertSame('2026-08-10 19:00:00', $start->toDateTimeString());
        $this->assertSame('2026-08-11 19:00:00', $end->toDateTimeString());
    }

    // ============ What the scopes actually return ============

    public function test_takings_count_the_trading_day_not_the_utc_calendar_day(): void
    {
        // 23:30 Tashkent on the 11th = 18:30 UTC. Same UTC day, same trading day.
        Payment::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'captured',
            'amount' => 10000000,
            'paid_at' => CarbonImmutable::parse('2026-08-11 18:30:00', 'UTC'),
        ]);

        // 01:30 Tashkent on the 12th = 20:30 UTC on the 11th. Still the same
        // trading evening — and the bill the old whereDate got wrong.
        Payment::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'captured',
            'amount' => 5000000,
            'paid_at' => CarbonImmutable::parse('2026-08-11 20:30:00', 'UTC'),
        ]);

        // 07:00 Tashkent on the 12th = 02:00 UTC. A new trading day.
        Payment::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'captured',
            'amount' => 99000000,
            'paid_at' => CarbonImmutable::parse('2026-08-12 02:00:00', 'UTC'),
        ]);

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-11 21:00:00', 'UTC'));

        $this->assertSame(15000000, (int) Payment::captured()->today()->sum('amount'));

        CarbonImmutable::setTestNow();
    }

    public function test_orders_follow_the_same_trading_day(): void
    {
        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'created_at' => CarbonImmutable::parse('2026-08-11 20:30:00', 'UTC'),
        ]);
        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'created_at' => CarbonImmutable::parse('2026-08-12 02:00:00', 'UTC'),
        ]);

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-11 21:00:00', 'UTC'));

        $this->assertSame(1, Order::today()->count());

        CarbonImmutable::setTestNow();
    }

    // ============ The SQL shape ============

    public function test_the_query_ranges_over_the_raw_column_so_an_index_can_be_used(): void
    {
        $sql = Payment::query()->today()->toSql();

        // `date(paid_at) = ?` would force PostgreSQL to compute a value for every
        // row on the table. A plain range lets it walk the index instead.
        $this->assertStringNotContainsStringIgnoringCase('date(', $sql);
        $this->assertStringContainsString('"paid_at" >=', $sql);
        $this->assertStringContainsString('"paid_at" <', $sql);
    }

    public function test_postgresql_really_does_use_the_index_for_a_trading_day_query(): void
    {
        $plan = collect(DB::select(
            'explain (costs off) '.
            'select sum(amount) from finance.payments '.
            "where tenant_id = ? and status = 'captured' and paid_at >= ? and paid_at < ?",
            [$this->tenant->id, now()->subDay(), now()],
        ))->pluck('QUERY PLAN')->implode(' ');

        // The table is nearly empty in a test, so the planner would normally
        // choose a sequential scan on cost alone. Forcing its hand proves an
        // index exists and is usable for this shape.
        DB::statement('set enable_seqscan = off');

        $forced = collect(DB::select(
            'explain (costs off) '.
            'select sum(amount) from finance.payments '.
            "where tenant_id = ? and status = 'captured' and paid_at >= ? and paid_at < ?",
            [$this->tenant->id, now()->subDay(), now()],
        ))->pluck('QUERY PLAN')->implode(' ');

        DB::statement('set enable_seqscan = on');

        $this->assertStringContainsString('Index', $forced, "No index is usable for a trading-day query.\n{$plan}");
    }

    // ============ Without a restaurant ============

    public function test_a_console_command_with_no_restaurant_falls_back_to_the_application(): void
    {
        app(TenantContext::class)->clear();

        $this->assertSame('UTC', $this->businessDay()->timezone());
        $this->assertSame('06:00', $this->businessDay()->startsAt());
    }
}
