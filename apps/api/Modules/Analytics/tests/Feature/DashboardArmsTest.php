<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Orders\Models\Order;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\PurchaseOrderItem;
use Modules\Suppliers\Models\Supplier;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * The five dashboard blocks that were honestly empty, now that they have producers.
 *
 * Each of these panels drew an empty state on a live tenant and a paragraph in
 * `dashboard-map.ts` explaining which module the answer lived in and why
 * Analytics could not reach it. Four new contract methods later they can be
 * drawn, and these are the assertions that keep them drawable: a shape test
 * asserting 200 would pass with an empty body, which is exactly the state
 * before this change.
 *
 * Every figure below is an exact number rather than a `assertIsArray`, because
 * the failure mode these panels have is not "missing" — it is *plausible*. A
 * grill bar at the wrong minute count and a payables list showing an invoice's
 * full value after half of it was settled both look completely normal.
 */
final class DashboardArmsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    private function ask(string $role, string $period = 'today'): TestResponse
    {
        return $this->getJson("/api/v1/dashboard?role={$role}&period={$period}");
    }

    private function today(): string
    {
        return app(BusinessDay::class)->dateFor();
    }

    // ============ The manager's station bars ============

    public function test_the_manager_gets_a_bar_per_station_with_its_own_target(): void
    {
        $this->signIn('branch-manager');

        KitchenStation::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'code' => 'grill',
            'sla_minutes' => 12,
            'sort_order' => 1,
        ]);
        KitchenStation::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'code' => 'cold',
            'sla_minutes' => 6,
            'sort_order' => 2,
        ]);

        // Fired eighteen minutes before it went out, so the grill's average is
        // eighteen against a target of twelve — the bar the panel exists for.
        KitchenTicket::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'station' => 'grill',
            'status' => 'ready',
            'created_at' => now()->subMinutes(30),
            'ready_at' => now()->subMinutes(12),
        ]);
        // Still cooking: counted as open, and NOT counted in the average —
        // a docket that has not finished has no duration.
        KitchenTicket::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'station' => 'grill',
            'status' => 'cooking',
        ]);

        $answer = $this->ask('manager')->assertOk();

        $stations = [];

        foreach ((array) $answer->json('data.stations') as $row) {
            $stations[(string) $row['station']] = $row;
        }

        $this->assertSame(18, $stations['grill']['average_minutes']);
        $this->assertSame(12, $stations['grill']['target_minutes']);
        $this->assertSame(1, $stations['grill']['open']);

        // A section that has cooked nothing is still a row, and its average is
        // null rather than zero: idle and instantaneous are different states.
        $this->assertNull($stations['cold']['average_minutes']);
        $this->assertSame(0, $stations['cold']['open']);
    }

    // ============ The storekeeper's incoming deliveries ============

    public function test_the_storekeeper_gets_todays_vans_and_how_many_arrived(): void
    {
        $this->signIn('storekeeper');

        $supplier = Supplier::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Anhor Meat',
        ]);

        $arrived = PurchaseOrder::query()->create([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $supplier->getKey(),
            'number' => 'PO-0001',
            'status' => 'received',
            'expected_at' => now()->startOfDay()->addHours(9),
            'received_at' => now()->startOfDay()->addHours(9),
            'total' => 1_200_000_00,
        ]);
        PurchaseOrderItem::factory()->count(3)->create([
            'tenant_id' => $this->tenant->id,
            'purchase_order_id' => $arrived->getKey(),
        ]);

        PurchaseOrder::query()->create([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $supplier->getKey(),
            'number' => 'PO-0002',
            'status' => 'sent',
            'expected_at' => now()->startOfDay()->addHours(16),
            'total' => 400_000_00,
        ]);

        // Tomorrow's van is not today's problem and must not be counted in a
        // KPI headed "bugun".
        PurchaseOrder::query()->create([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $supplier->getKey(),
            'number' => 'PO-0003',
            'status' => 'sent',
            'expected_at' => now()->addDay()->startOfDay()->addHours(9),
            'total' => 900_000_00,
        ]);

        $answer = $this->ask('warehouse')->assertOk();

        $this->assertSame(2, $answer->json('data.deliveries_expected'));
        $this->assertSame(1, $answer->json('data.deliveries_accepted'));

        // Earliest first — a receiving bay works through the morning.
        $this->assertSame('PO-0001', $answer->json('data.deliveries.0.number'));
        $this->assertSame('Anhor Meat', $answer->json('data.deliveries.0.supplier'));
        $this->assertSame(3, $answer->json('data.deliveries.0.lines'));
        $this->assertNotNull($answer->json('data.deliveries.0.received_at'));
        $this->assertNull($answer->json('data.deliveries.1.received_at'));
    }

    public function test_another_restaurants_delivery_is_not_on_this_ones_dashboard(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $theirSupplier = Supplier::query()->create([
            'tenant_id' => $other->id,
            'code' => 'SUP-999',
            'name' => 'Somebody Else',
            'category' => 'meat',
            'payment_terms_days' => 0,
            'lead_time_days' => 1,
            'rating' => 5,
            'debt' => 0,
            'is_active' => true,
        ]);
        PurchaseOrder::query()->create([
            'tenant_id' => $other->id,
            'supplier_id' => $theirSupplier->getKey(),
            'number' => 'PO-9999',
            'status' => 'sent',
            'expected_at' => now()->startOfDay()->addHours(9),
            'total' => 5_000_000_00,
        ]);

        $this->signIn('storekeeper');

        $answer = $this->ask('warehouse')->assertOk();

        $this->assertSame(0, $answer->json('data.deliveries_expected'));
        $this->assertSame([], $answer->json('data.deliveries'));
    }

    // ============ The accountant's payables ============

    public function test_the_accountant_gets_what_is_owed_and_what_is_already_late(): void
    {
        $this->signIn('accountant');

        $cash = Supplier::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Nasiya Yo\'q',
            'payment_terms_days' => 0,
        ]);
        $terms = Supplier::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'O\'ttiz Kun',
            'payment_terms_days' => 30,
        ]);

        // Delivered a week ago on pay-at-the-door terms: overdue by a week.
        PurchaseOrder::query()->create([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $cash->getKey(),
            'number' => 'PO-0010',
            'status' => 'received',
            'expected_at' => now()->subWeek(),
            'received_at' => now()->subWeek(),
            'total' => 800_000_00,
            'paid_amount' => 300_000_00,
        ]);

        // Delivered yesterday on thirty-day terms: unpaid, not yet late.
        PurchaseOrder::query()->create([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $terms->getKey(),
            'number' => 'PO-0011',
            'status' => 'received',
            'expected_at' => now()->subDay(),
            'received_at' => now()->subDay(),
            'total' => 500_000_00,
        ]);

        $answer = $this->ask('accountant')->assertOk();

        $this->assertSame(2, $answer->json('data.unpaid_invoices'));
        $this->assertSame(1, $answer->json('data.overdue_invoices'));

        // What is LEFT, not the invoice total: 800 000 less the 300 000 paid.
        $this->assertSame(500_000_00 + 500_000_00, $answer->json('data.payables_tiyin'));

        // Soonest deadline first, so the top row is the one already late.
        $this->assertSame('PO-0010', $answer->json('data.upcoming.0.number'));
        $this->assertSame(500_000_00, $answer->json('data.upcoming.0.amount_tiyin'));
        $this->assertNotNull($answer->json('data.upcoming.0.due_at'));

        /*
         * The countdown, in the restaurant's own calendar. Delivered a week ago
         * on pay-at-the-door terms, so it is seven sleeps behind; the other is
         * thirty days from yesterday, so twenty-nine ahead. Counted here rather
         * than in the browser because a day boundary needs a timezone.
         */
        $this->assertSame(-7, $answer->json('data.upcoming.0.due_in_days'));
        $this->assertSame(29, $answer->json('data.upcoming.1.due_in_days'));
    }

    public function test_the_expense_budget_is_a_plan_from_settings_and_null_until_one_is_set(): void
    {
        $this->signIn('accountant');

        $this->assertNull($this->ask('accountant')->assertOk()->json('data.expense_budget_tiyin'));

        $this->tenant->forceFill([
            'settings' => ['targets' => ['expense_monthly_tiyin' => 168_000_000_00]],
        ])->save();
        app(TenantContext::class)->set($this->tenant->fresh());

        /*
         * `AnalyticsController::home()` remembers a dashboard for sixty seconds
         * per restaurant, venue, role and trading day — so without this the
         * second call answers the first call's body and the assertion below
         * would pass for a budget nobody had set.
         */
        Cache::flush();

        $this->assertSame(
            168_000_000_00,
            $this->ask('accountant')->assertOk()->json('data.expense_budget_tiyin'),
        );
    }

    // ============ The waiter's own section ============

    public function test_a_waiter_sees_the_tables_they_claimed_and_what_is_running_on_them(): void
    {
        $waiter = $this->signIn('waiter');

        $hall = Hall::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name' => 'Terrasa',
        ]);

        $mine = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'hall_id' => $hall->getKey(),
            'label' => 'A-1',
            'seats' => 4,
            'status' => 'occupied',
            'claimed_by_user_id' => $waiter->getKey(),
            'claimed_at' => now()->subHour(),
        ]);

        // Claimed, empty, and still theirs — an empty table in somebody's
        // section is the thing they are meant to fill.
        RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'hall_id' => $hall->getKey(),
            'label' => 'A-2',
            'seats' => 2,
            'status' => 'free',
            'claimed_by_user_id' => $waiter->getKey(),
        ]);

        // Somebody else's table, in the same room.
        RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'hall_id' => $hall->getKey(),
            'label' => 'B-9',
            'claimed_by_user_id' => User::factory()->create(['tenant_id' => $this->tenant->id])->getKey(),
        ]);

        $bill = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'restaurant_table_id' => $mine->getKey(),
            'waiter_user_id' => $waiter->getKey(),
            'status' => 'placed',
            'guests_count' => 3,
            'subtotal' => 318_000_00,
            'total' => 318_000_00,
        ]);
        $bill->forceFill(['business_date' => $this->today()])->save();

        $answer = $this->ask('waiter')->assertOk();

        $tables = [];

        foreach ((array) $answer->json('data.tables') as $row) {
            $tables[(string) $row['label']] = $row;
        }

        $this->assertCount(2, $tables, 'a waiter must not be shown a colleague\'s section');
        $this->assertSame('Terrasa', $tables['A-1']['zone']);
        $this->assertSame(318_000_00, $tables['A-1']['bill_tiyin']);
        $this->assertSame(3, $tables['A-1']['guests']);
        $this->assertNotNull($tables['A-1']['since']);

        // Claimed and empty: the row survives with nulls where the bill would be.
        $this->assertNull($tables['A-2']['bill_tiyin']);
        $this->assertNull($tables['A-2']['guests']);
    }

    // ============ The owner's weekday baseline ============

    public function test_the_hourly_chart_carries_this_weekdays_average(): void
    {
        $this->signIn('owner');

        $today = CarbonImmutable::parse($this->today());

        // Two of the same weekday behind us, at the same hour, so the average
        // is a number a reader could check on paper: (300 + 500) / 2.
        foreach ([[1, 300_000_00], [2, 500_000_00]] as [$weeksAgo, $amount]) {
            $past = Order::factory()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $this->branch->id,
                'status' => 'paid',
                'subtotal' => $amount,
                'total' => $amount,
                'placed_at' => $today->subWeeks($weeksAgo)->setTime(13, 0),
            ]);
            $past->forceFill([
                'business_date' => $today->subWeeks($weeksAgo)->toDateString(),
            ])->save();
        }

        $hours = $this->ask('owner')->assertOk()->json('data.hours');

        $byHour = [];

        foreach ((array) $hours as $row) {
            $byHour[(int) $row['hour']] = $row;
        }

        $this->assertSame(400_000_00, $byHour[13]['average_tiyin']);
        // An hour this weekday has never traded in has no average, and a zero
        // baseline drawn under today's curve would read as a record day.
        $this->assertNull($byHour[4]['average_tiyin']);
    }

    public function test_a_week_window_draws_no_weekday_baseline_at_all(): void
    {
        $this->signIn('owner');

        $hours = $this->ask('owner', 'week')->assertOk()->json('data.hours');

        foreach ((array) $hours as $row) {
            $this->assertNull(
                $row['average_tiyin'],
                'a one-day baseline under a seven-day bar would report a 600% record every week',
            );
        }
    }
}
