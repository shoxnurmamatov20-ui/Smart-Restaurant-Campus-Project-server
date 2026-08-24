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
use Modules\Analytics\Models\DailyFact;
use Modules\Finance\Models\Expense;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * The projection, and the two figures it exists for.
 *
 * Everything else on the analytics screen is derived on read, deliberately —
 * `AnalyticsController` argues for it. Labour cost and waste cannot be: they
 * live in Staff and Inventory, which `ModuleBoundaryTest` does not let this
 * module read, so they arrive through a contract once a night and land here.
 *
 * The numbers below are asserted exactly, from a fixture built in the test
 * rather than from a factory's randomness. A rollup test that only checked "a
 * row exists" would pass with every figure zero, which is precisely the failure
 * mode a nightly projection has.
 */
final class DailyRollupTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $yunusobod;

    private string $today;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);
        $this->yunusobod = Branch::factory()->named('Yunusobod', 'YNS')->create(['tenant_id' => $this->tenant->id]);

        $this->today = app(BusinessDay::class)->dateFor();
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    /** A settled bill for one dish, on one venue's trading day. */
    private function bill(Branch $at, MenuItem $dish, int $quantity, int $unitPrice, string $day): Order
    {
        $total = $quantity * $unitPrice;

        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $at->id,
            'status' => 'paid',
            'guests_count' => 2,
            'subtotal' => $total,
            'total' => $total,
        ]);

        $order->forceFill(['business_date' => $day])->save();

        OrderItem::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->getKey(),
            'menu_item_id' => $dish->getKey(),
            'sku' => $dish->sku,
            'title' => 'Osh',
            'station' => 'hot',
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'total_price' => $total,
            'status' => 'served',
        ]);

        return $order;
    }

    /**
     * A four-hour shift, worked and closed, at a named venue.
     *
     * `branch_id` is forced rather than passed to `create()`: it is not
     * fillable on `Attendance` — `BelongsToBranch` stamps it from the request's
     * context — and a test that let it default would silently record the shift
     * at no venue at all, which is exactly the figure this file is asserting.
     */
    private function attended(int $memberId, int $branchId): void
    {
        $row = Attendance::query()->create([
            'tenant_id' => $this->tenant->id,
            'staff_member_id' => $memberId,
            'checked_in_at' => now()->setTime(9, 0),
            'checked_out_at' => now()->setTime(13, 0),
            'minutes_worked' => 240,
            'method' => 'pin',
        ]);

        $row->forceFill(['branch_id' => $branchId])->save();
    }

    private function rollUp(): void
    {
        $this->artisan('analytics:rollup', ['--from' => $this->today])->assertSuccessful();
    }

    /**
     * The first row of a JSON list whose column matches.
     *
     * @return array<string, mixed>
     */
    private static function firstWith(mixed $rows, string $key, string $value): array
    {
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && ($row[$key] ?? null) === $value) {
                return $row;
            }
        }

        return [];
    }

    // ============ The shape ============

    public function test_a_row_lands_for_every_venue_and_one_for_the_business(): void
    {
        $this->rollUp();

        // Two venues plus the business roll-up. The roll-up is its own pass
        // rather than a sum of the venues, because an order with no branch
        // belongs to the business and to no venue.
        $this->assertSame(3, DailyFact::query()->withoutGlobalScope('branch')->count());
        $this->assertSame(1, DailyFact::query()->withoutGlobalScope('branch')->rollup()->count());
    }

    public function test_running_it_twice_produces_the_same_row_rather_than_a_second(): void
    {
        $dish = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 45_000_00)->create();
        $this->bill($this->chilonzor, $dish, 2, 45_000_00, $this->today);

        $this->rollUp();
        $this->rollUp();

        // Two rows for one Tuesday would report a restaurant that earned twice.
        $this->assertSame(3, DailyFact::query()->withoutGlobalScope('branch')->count());
        $this->assertSame(90_000_00, (int) DailyFact::query()->withoutGlobalScope('branch')->rollup()
            ->firstOrFail()->revenue_tiyin);
    }

    // ============ The figures ============

    public function test_the_business_row_carries_the_days_revenue_covers_and_cost(): void
    {
        // 45 000 so'm a plate, 18 000 of it food. Both are stored, so the
        // margin cannot drift from the recipe.
        $dish = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 45_000_00)->create();
        $dish->forceFill(['cost_price' => 18_000_00])->save();

        $this->bill($this->chilonzor, $dish, 2, 45_000_00, $this->today);
        $this->bill($this->yunusobod, $dish, 1, 45_000_00, $this->today);

        Expense::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'category' => 'utilities',
            'description' => 'Elektr energiyasi',
            'amount' => 30_000_00,
            'business_date' => $this->today,
            'spent_at' => now(),
        ]);

        $this->rollUp();

        $business = DailyFact::query()->withoutGlobalScope('branch')->rollup()->firstOrFail();

        // Two bills — three plates at 45 000, two of them on one bill.
        $this->assertSame(135_000_00, $business->revenue_tiyin);
        $this->assertSame(2, $business->orders_count);
        $this->assertSame(4, $business->guests_count);
        $this->assertSame(54_000_00, $business->cogs_tiyin);
        $this->assertSame(30_000_00, $business->expenses_tiyin);
        // Every line sold came from a costed dish.
        $this->assertSame(100, $business->cogs_coverage_percent);
    }

    public function test_an_uncosted_dish_lowers_the_coverage_rather_than_reading_as_pure_profit(): void
    {
        $costed = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 50_000_00)->create();
        $costed->forceFill(['cost_price' => 20_000_00])->save();

        $uncosted = MenuItem::factory()->dish('CHY-1', 'Choy', 'Чай', 'Tea', 50_000_00)->create();
        $uncosted->forceFill(['cost_price' => null])->save();

        $this->bill($this->chilonzor, $costed, 1, 50_000_00, $this->today);
        $this->bill($this->chilonzor, $uncosted, 1, 50_000_00, $this->today);

        $this->rollUp();

        $business = DailyFact::query()->withoutGlobalScope('branch')->rollup()->firstOrFail();

        // Half the sales came from a dish nobody has costed. The cost side
        // counts only the half it knows, and the coverage says which half —
        // counting the tea as zero cost would report it as pure profit.
        $this->assertSame(20_000_00, $business->cogs_tiyin);
        $this->assertSame(50, $business->cogs_coverage_percent);
    }

    public function test_labour_crosses_the_boundary_and_lands_on_the_venue_that_worked_it(): void
    {
        $person = User::factory()->create(['tenant_id' => $this->tenant->id]);

        $member = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'user_id' => $person->getKey(),
            'hourly_rate' => 30_000_00,
            'status' => 'active',
        ]);

        // Four hours, closed and stamped — so its own `minutes_worked` is what
        // is paid rather than a clock reading taken now.
        $this->attended($member->getKey(), $this->chilonzor->id);

        $this->rollUp();

        $rows = DailyFact::query()->withoutGlobalScope('branch')->get()->keyBy('branch_id');

        // 4 h × 30 000 so'm. Analytics cannot read `staff.attendances` at all —
        // this number arrived through App\Contracts\Staff\Roster.
        $this->assertSame(120_000_00, (int) $rows[$this->chilonzor->id]->labour_tiyin);
        $this->assertSame(0, (int) $rows[$this->yunusobod->id]->labour_tiyin);
    }

    public function test_the_labour_share_reaches_the_dashboard_that_could_not_compute_it(): void
    {
        $dish = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 50_000_00)->create();
        $this->bill($this->chilonzor, $dish, 8, 50_000_00, $this->today);

        $person = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $member = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'user_id' => $person->getKey(),
            'hourly_rate' => 20_000_00,
            'status' => 'active',
        ]);

        $this->attended($member->getKey(), $this->chilonzor->id);

        $this->rollUp();

        $manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $manager->assignRole('branch-manager');
        $this->actingAs($manager);

        $answer = $this->getJson('/api/v1/dashboard?role=manager&period=today')->assertOk();

        $labour = self::firstWith($answer->json('data.kpis'), 'key', 'labour_cost');

        // 80 000 so'm of wages against 400 000 of revenue.
        $this->assertSame('percent', $labour['unit']);
        // JSON has one number type: 20.0 comes back as an int through
        // json_decode, so the comparison is on value rather than on type.
        $this->assertEquals(20.0, $labour['value']);
    }

    public function test_a_day_nobody_has_rolled_up_reports_null_rather_than_zero(): void
    {
        $dish = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 50_000_00)->create();
        $this->bill($this->chilonzor, $dish, 1, 50_000_00, $this->today);

        $manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $manager->assignRole('branch-manager');
        $this->actingAs($manager);

        $answer = $this->getJson('/api/v1/dashboard?role=manager&period=today')->assertOk();

        // No projection yet. A labour share of 0% and a labour share nobody has
        // computed look identical on a card, and only one of them is a reason
        // to go and look at the rota.
        $this->assertNull(self::firstWith($answer->json('data.kpis'), 'key', 'labour_cost')['value']);
    }

    // ============ Isolation ============

    public function test_one_restaurants_projection_never_reads_anothers_trade(): void
    {
        $dish = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 50_000_00)->create();
        $this->bill($this->chilonzor, $dish, 1, 50_000_00, $this->today);

        $elsewhere = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Order::query()->create([
            'tenant_id' => $elsewhere->id,
            'number' => 'X-1',
            'channel' => 'dine_in',
            'status' => 'paid',
            'guests_count' => 2,
            'subtotal' => 900_000_00,
            'discount_total' => 0,
            'service_charge' => 0,
            'total' => 900_000_00,
            'business_date' => $this->today,
        ]);

        // The command walks every restaurant on the platform, one focused
        // connection at a time. The other one's 900 000 must not appear here.
        $this->artisan('analytics:rollup', ['--from' => $this->today])->assertSuccessful();

        $mine = DailyFact::query()->withoutGlobalScope('branch')->rollup()->firstOrFail();

        $this->assertSame($this->tenant->id, $mine->tenant_id);
        $this->assertSame(50_000_00, $mine->revenue_tiyin);
    }
}
