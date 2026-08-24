<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Analytics\Services\RoleDashboards;
use Modules\Inventory\Models\Ingredient;
use Modules\Orders\Models\Order;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * Seven home screens off one endpoint, and the blocks each of them needs.
 *
 * Only the owner's was ever wired: `overview-server.ts` mapped it and the other
 * six screens read their own fixtures. What made that stick was the shape —
 * five roles existed on the server, `waiter` and `operator` did not, and three
 * of the five answered a KPI row and nothing else.
 *
 * The tests below are about the CONTRACT the console maps against, so each one
 * names the keys that screen cannot be drawn without. A shape test that only
 * asserted 200 would pass with an empty body.
 */
final class RoleDashboardTest extends TestCase
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

    private function ask(string $role): TestResponse
    {
        return $this->getJson("/api/v1/dashboard?role={$role}&period=today");
    }

    /**
     * A JSON list, keyed by one of its columns.
     *
     * `collect($response->json(...))` cannot be typed — `json()` answers mixed
     * — and PHPStan refuses it rather than guessing. Narrowing here once is the
     * honest fix; the alternatives are a suppression or a cast.
     *
     * @return array<int|string, array<string, mixed>>
     */
    private static function keyed(mixed $rows, string $by): array
    {
        $keyed = [];

        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && isset($row[$by]) && (is_int($row[$by]) || is_string($row[$by]))) {
                $keyed[$row[$by]] = $row;
            }
        }

        return $keyed;
    }

    /**
     * One column out of a JSON list, in order.
     *
     * @return array<int, mixed>
     */
    private static function columnOf(mixed $rows, string $key): array
    {
        $values = [];

        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && array_key_exists($key, $row)) {
                $values[] = $row[$key];
            }
        }

        return $values;
    }

    // ============ Every role answers a shape ============

    public function test_every_role_the_service_names_answers_its_own_shape(): void
    {
        $this->signIn('owner');

        // The seven are the console's seven dashboards. A role added to ROLES
        // and given no block would answer a KPI row over an empty body, which
        // is the failure this asserts against.
        foreach (RoleDashboards::ROLES as $role) {
            $answer = $this->ask($role)->assertOk();

            $this->assertSame($role, $answer->json('data.role'));
            $this->assertNotEmpty($answer->json('data.kpis'), "{$role} answered no KPIs");
            $this->assertSame('today', $answer->json('data.window.period'));
        }
    }

    public function test_an_unknown_role_falls_back_rather_than_failing(): void
    {
        $this->signIn('owner');

        // A stale bookmark or a role this console has no screen for should draw
        // something coherent, not put a 422 where a home screen was.
        $this->ask('sommelier')->assertOk()->assertJsonPath('data.role', 'manager');
    }

    // ============ The blocks each screen cannot be drawn without ============

    public function test_the_manager_gets_the_floor_the_head_count_and_their_waiters(): void
    {
        $manager = $this->signIn('branch-manager');

        $hall = Hall::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id]);
        RestaurantTable::factory()->count(3)->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'hall_id' => $hall->getKey(),
        ]);

        $waiter = $this->signIn('waiter');
        $bill = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'waiter_user_id' => $waiter->getKey(),
            'status' => 'paid',
            'guests_count' => 4,
            'subtotal' => 200_000_00,
            'total' => 200_000_00,
        ]);
        $bill->forceFill(['business_date' => app(BusinessDay::class)->dateFor()])->save();

        $this->actingAs($manager);
        $answer = $this->ask('manager')->assertOk();

        // The floor and the head count cross a module boundary — they arrive
        // through App\Contracts\Tables\FloorBoard and \Staff\Roster.
        $this->assertSame(3, $answer->json('data.floor.free'));
        $this->assertSame(0, $answer->json('data.on_shift_count'));

        $this->assertSame($waiter->getKey(), $answer->json('data.waiters.0.user_id'));
        $this->assertSame(200_000_00, $answer->json('data.waiters.0.revenue_tiyin'));
        $this->assertSame(1, $answer->json('data.waiters.0.tickets'));

        // And the two panels the console kept as fixtures because "a rules
        // engine that does not exist yet".
        $this->assertIsArray($answer->json('data.attention'));
        $this->assertSame('paid', $answer->json('data.recent_orders.0.status'));
    }

    public function test_the_warehouse_screen_gets_the_shelf_through_the_contract(): void
    {
        $this->signIn('storekeeper');

        Ingredient::factory()->create([
            'tenant_id' => $this->tenant->id,
            'stock_quantity' => 0,
            'min_quantity' => 100,
        ]);
        Ingredient::factory()->create([
            'tenant_id' => $this->tenant->id,
            'stock_quantity' => 50,
            'min_quantity' => 100,
        ]);
        Ingredient::factory()->create([
            'tenant_id' => $this->tenant->id,
            'stock_quantity' => 5_000,
            'min_quantity' => 100,
        ]);

        $answer = $this->ask('warehouse')->assertOk();

        // Exclusive and in order of urgency: out, then low, then the rest.
        $this->assertSame(1, $answer->json('data.stock.out'));
        $this->assertSame(1, $answer->json('data.stock.low'));
        $this->assertSame(1, $answer->json('data.stock.ok'));

        $keys = self::columnOf($answer->json('data.kpis'), 'key');
        $this->assertSame(['stock_low', 'stock_out', 'stock_expiring', 'waste_percent'], $keys);
    }

    public function test_a_waiters_dashboard_is_theirs_and_not_the_venues(): void
    {
        $mine = $this->signIn('waiter');
        $today = app(BusinessDay::class)->dateFor();

        $ofMine = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'waiter_user_id' => $mine->getKey(),
            'status' => 'paid',
            'guests_count' => 3,
            'subtotal' => 100_000_00,
            'total' => 100_000_00,
        ]);
        $ofMine->forceFill(['business_date' => $today])->save();

        $colleague = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $theirs = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'waiter_user_id' => $colleague->getKey(),
            'status' => 'paid',
            'guests_count' => 8,
            'subtotal' => 900_000_00,
            'total' => 900_000_00,
        ]);
        $theirs->forceFill(['business_date' => $today])->save();

        $this->actingAs($mine);
        $answer = $this->ask('waiter')->assertOk();

        $kpis = self::keyed($answer->json('data.kpis'), 'key');

        // A waiter who can read the venue's takings can work out a colleague's,
        // so this screen is scoped to the signed-in person rather than the role.
        $this->assertSame(100_000_00, $kpis['revenue']['value']);
        $this->assertSame(3, $kpis['guests']['value']);
        $this->assertSame(1, $kpis['orders']['value']);
    }

    public function test_the_operator_gets_what_is_already_late(): void
    {
        $this->signIn('order-operator');

        $late = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'channel' => 'delivery',
            'status' => 'ready',
        ]);
        $late->forceFill(['promised_at' => now()->subMinutes(12)])->save();

        // Promised, and not yet due. An intake desk that saw this one would
        // stop trusting the panel by lunchtime.
        $fine = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'channel' => 'delivery',
            'status' => 'cooking',
        ]);
        $fine->forceFill(['promised_at' => now()->addMinutes(20)])->save();

        $answer = $this->ask('operator')->assertOk();

        $answer->assertJsonCount(1, 'data.late');
        $this->assertSame($late->number, $answer->json('data.late.0.number'));
        $this->assertSame(12, $answer->json('data.late.0.minutes_late'));
        // `ready` and late means it is waiting for somebody to carry it.
        $this->assertSame('no_courier', $answer->json('data.late.0.reason'));
    }

    public function test_the_operator_gets_the_door_each_order_came_through(): void
    {
        $this->signIn('order-operator');
        $today = app(BusinessDay::class)->dateFor();

        foreach ([['phone', 60_000_00], ['phone', 40_000_00], ['telegram', 30_000_00]] as [$lane, $total]) {
            $order = Order::factory()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $this->branch->id,
                'intake_channel' => $lane,
                'status' => 'paid',
                'subtotal' => $total,
                'total' => $total,
            ]);
            $order->forceFill(['business_date' => $today])->save();
        }

        // Started in the room, so it belongs to no intake lane at all — this is
        // the row that separates `intake_channels` from `channels`.
        $inRoom = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'intake_channel' => null,
            'status' => 'paid',
            'subtotal' => 500_000_00,
            'total' => 500_000_00,
        ]);
        $inRoom->forceFill(['business_date' => $today])->save();

        $answer = $this->ask('operator')->assertOk();

        $lanes = self::keyed($answer->json('data.intake_channels'), 'channel');

        $this->assertSame(['phone', 'telegram'], array_keys($lanes));
        $this->assertSame(2, $lanes['phone']['orders_count']);
        $this->assertSame(100_000_00, $lanes['phone']['revenue_tiyin']);
        $this->assertSame(1, $lanes['telegram']['orders_count']);
    }

    public function test_the_cashier_gets_the_drawer_and_the_last_few_payments(): void
    {
        $this->signIn('cashier');

        $answer = $this->ask('cashier')->assertOk();

        // No till open yet — null rather than an invented drawer.
        $this->assertNull($answer->json('data.shift'));
        $this->assertIsArray($answer->json('data.recent_payments'));
        $this->assertIsArray($answer->json('data.methods'));

        // Nobody is waiting to pay at a venue with no bills. Zero, not the
        // three the console used to draw from its fixture.
        $this->assertSame(0, $answer->json('data.tables_awaiting'));
    }

    public function test_the_cashier_counts_tables_waiting_to_pay_not_bills(): void
    {
        $this->signIn('cashier');

        $hall = Hall::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id]);
        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'hall_id' => $hall->getKey(),
        ]);

        // A party that split onto two bills is one table, and the card says
        // "tables" — so this must not answer two.
        Order::factory()->count(2)->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'restaurant_table_id' => $table->getKey(),
            'status' => 'topay',
        ]);

        // Still eating: `served` is not `topay`, and counting it would send a
        // cashier to a table that has not asked for the bill.
        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'restaurant_table_id' => $table->getKey(),
            'status' => 'served',
        ]);

        $this->assertSame(1, $this->ask('cashier')->assertOk()->json('data.tables_awaiting'));
    }

    public function test_the_accountant_gets_six_months_of_cash_flow(): void
    {
        $this->signIn('accountant');

        $answer = $this->ask('accountant')->assertOk();

        // Six, and a month with no trade is kept at zero rather than dropped —
        // closing the gap would make a shut venue look like a busy one.
        $answer->assertJsonCount(6, 'data.cashflow');
        $this->assertSame(0, $answer->json('data.cashflow.0.inflow_tiyin'));

        $keys = self::columnOf($answer->json('data.kpis'), 'key');
        $this->assertContains('gross_profit', $keys);
        $this->assertContains('net_margin', $keys);
    }

    // ============ The role is not authorisation ============

    public function test_a_waiter_reaches_their_home_screen_but_not_the_reports(): void
    {
        $this->signIn('waiter');

        // The two permissions, doing two different jobs. `dashboard.view` opens
        // the home screen every role has; `analytics.view` opens the venue's
        // sales, its food cost and its ABC analysis, and a waiter holds none of
        // it. Collapsing them was what made this screen unreachable.
        $this->ask('waiter')->assertOk();
        $this->getJson('/api/v1/analytics/sales')->assertStatus(403);
        $this->getJson('/api/v1/analytics/summary')->assertStatus(403);
    }

    public function test_a_cook_has_no_console_home_screen(): void
    {
        // The kitchen brigade lives on the KDS and the layout never sends them
        // here. `dashboard.view` is not "everybody" — it is every role with a
        // console screen, which is what makes it a permission rather than a
        // formality.
        $this->signIn('cook');

        $this->ask('manager')->assertStatus(403);
    }
}
