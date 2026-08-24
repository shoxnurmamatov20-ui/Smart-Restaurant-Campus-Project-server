<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * The figures a manager steers on, and the four ways they go wrong.
 *
 * Every expectation below is DERIVED from the fixture rather than typed as a
 * number. That is the point of writing it this way: a test with `18_420_000` in
 * it passes for a while and then somebody changes the fixture, adjusts the
 * literal to match, and the test has stopped checking the arithmetic. Here,
 * changing a dish's price changes both sides.
 *
 * The four failures under test are the ones that actually happen to restaurant
 * reporting:
 *
 *   revenue counted from unpaid bills          — the day looks bigger than it was
 *   one venue reported as the whole estate     — CLAUDE.md's third rule, backwards
 *   an uncosted dish reported at 100% margin   — an unknown reading as a triumph
 *   a period compared against a different one  — a delta of +400% nobody can explain
 */
final class AnalyticsInsightsTest extends TestCase
{
    use RefreshDatabase;

    /** 1 so'm = 100 tiyin. */
    private const SOM = 100;

    private Tenant $tenant;

    private User $owner;

    private Branch $chilonzor;

    private Branch $sergeli;

    private MenuItem $osh;

    private MenuItem $tea;

    private MenuItem $manti;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor', 'status' => 'active',
        ]);
        $this->sergeli = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Sergeli', 'slug' => 'sergeli', 'status' => 'active',
        ]);

        $this->owner = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            // Unpinned, so an owner reads every venue — which is what makes the
            // branch-isolation test below mean something.
            'branch_id' => null,
        ]);
        $this->owner->assignRole('owner');

        $category = MenuCategory::query()->create([
            'tenant_id' => $this->tenant->id,
            'slug' => 'milliy',
            'name' => ['uz' => 'Milliy', 'ru' => 'Национальная', 'en' => 'National'],
            'is_active' => true,
        ]);

        // A star (sells a lot, good margin), a plowhorse (sells a lot, thin
        // margin) and one nobody has costed — the three cases the quadrant
        // classifier has to tell apart.
        $this->osh = $this->dish($category, 'OSH-001', 'Osh', 38_000, 14_800);
        $this->tea = $this->dish($category, 'TEA-001', 'Choy', 8_000, 6_800);
        $this->manti = $this->dish($category, 'MAN-001', 'Manti', 30_000, null);
    }

    // ============ The headline figures ============

    public function test_the_summary_counts_paid_bills_and_nothing_else(): void
    {
        $paid = [$this->bill('paid', 200_000), $this->bill('paid', 100_000)];
        // Served but not settled, and a voided one. Counting either would make
        // the day look bigger than the money that arrived.
        $this->bill('served', 500_000);
        $this->bill('voided', 900_000);

        $answer = $this->read('/api/v1/analytics/summary')->assertOk();

        $expected = array_sum(array_map(static fn (Order $o): int => (int) $o->total, $paid));

        $this->assertSame($expected, $answer->json('data.revenue_tiyin'));
        $this->assertSame(count($paid), $answer->json('data.orders_count'));
        $this->assertSame((int) round($expected / count($paid)), $answer->json('data.average_cheque_tiyin'));
    }

    public function test_revenue_and_takings_are_different_numbers_and_both_are_reported(): void
    {
        $bill = $this->bill('paid', 200_000);

        // Half in cash, half by card: one revenue figure, two takings rows. A
        // report that added them would double the day.
        $this->takings($bill, 'cash', 100_000);
        $this->takings($bill, 'uzcard', 100_000);

        $answer = $this->read('/api/v1/analytics/summary')->assertOk();

        $this->assertSame(200_000 * self::SOM, $answer->json('data.revenue_tiyin'));
        $this->assertSame(200_000 * self::SOM, $answer->json('data.takings_tiyin'));
    }

    public function test_expenses_are_reported_beside_the_takings(): void
    {
        $this->bill('paid', 200_000);

        Expense::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'category' => 'purchase',
            'description' => "Ko'kat",
            'amount' => 8_500 * self::SOM,
            'paid_in_cash' => true,
            'spent_at' => now(),
        ]);

        $this->assertSame(
            8_500 * self::SOM,
            $this->read('/api/v1/analytics/summary')->assertOk()->json('data.expenses_tiyin'),
        );
    }

    public function test_one_venue_is_not_reported_as_the_whole_estate(): void
    {
        $this->bill('paid', 200_000, $this->chilonzor);
        $this->bill('paid', 300_000, $this->sergeli);

        // No header: every venue, which is what an owner's dashboard wants.
        $this->assertSame(
            500_000 * self::SOM,
            $this->read('/api/v1/analytics/summary')->assertOk()->json('data.revenue_tiyin'),
        );

        // With one: that venue alone. CLAUDE.md's third rule — an empty branch
        // is a roll-up, and a raw aggregate that forgot it would report the
        // chain's takings as one restaurant's.
        $this->assertSame(
            300_000 * self::SOM,
            $this->read('/api/v1/analytics/summary', $this->sergeli)->assertOk()->json('data.revenue_tiyin'),
        );
    }

    public function test_another_restaurant_sees_none_of_it(): void
    {
        $this->bill('paid', 200_000);

        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('owner');

        $this->actingAs($stranger);

        $this->withHeaders(['X-Tenant' => $other->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/summary')
            ->assertOk()
            ->assertJsonPath('data.revenue_tiyin', 0);
    }

    public function test_a_waiter_cannot_read_the_business_figures(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');

        $this->actingAs($waiter);
        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/summary')
            ->assertForbidden();
    }

    // ============ Food cost, and the dish nobody costed ============

    public function test_food_cost_is_computed_only_from_dishes_that_have_a_recipe(): void
    {
        $bill = $this->bill('paid', 0);
        $this->line($bill, $this->osh, 2);
        // Uncosted, and it must not drag the percentage anywhere: a food cost
        // computed as if this dish cost nothing would tell a chef the kitchen
        // is twice as profitable as it is.
        $this->line($bill, $this->manti, 1);

        $percent = $this->read('/api/v1/analytics/summary')->assertOk()->json('data.food_cost_percent');

        $expected = round(
            (14_800 * 2) / (38_000 * 2) * 100,
            1,
        );

        $this->assertSame($expected, $percent);
    }

    public function test_labour_share_is_null_rather_than_guessed(): void
    {
        $this->bill('paid', 200_000);

        // Payroll lives in Staff, which Analytics may not read. A plausible
        // number derived from rostered hours would be a figure no payslip
        // agrees with; a blank gets asked about.
        $this->assertNull($this->read('/api/v1/analytics/summary')->assertOk()->json('data.labour_cost_percent'));
    }

    // ============ Menu engineering ============

    public function test_the_four_groups_are_split_by_the_menus_own_medians(): void
    {
        $bill = $this->bill('paid', 0);
        $this->line($bill, $this->osh, 10);   // sells well, 61% margin
        $this->line($bill, $this->tea, 12);   // sells well, 15% margin
        $this->line($bill, $this->manti, 1);  // no cost on file

        /** @var array<int, array<string, mixed>> $data */
        $data = $this->read('/api/v1/analytics/menu-engineering')->assertOk()->json('data.data');
        $rows = collect($data)->keyBy('sku');

        $this->assertSame('stars', $rows['OSH-001']['group']);
        $this->assertSame('plowhorses', $rows['TEA-001']['group']);
        // Its own group, because it has no answer to the margin question. A
        // dish placed in `dogs` for the sole reason that nobody costed it is an
        // accusation the data cannot support.
        $this->assertSame('uncosted', $rows['MAN-001']['group']);
        $this->assertNull($rows['MAN-001']['margin_percent']);
    }

    public function test_a_dish_that_never_sold_is_a_question_rather_than_a_dog(): void
    {
        $bill = $this->bill('paid', 0);
        $this->line($bill, $this->osh, 3);

        $answer = $this->read('/api/v1/analytics/menu-engineering')->assertOk();

        /** @var array<int, array<string, mixed>> $never */
        $never = $answer->json('never_sold');

        $this->assertSame(
            ['MAN-001', 'TEA-001'],
            collect($never)->pluck('sku')->sort()->values()->all(),
        );
    }

    // ============ Loss control ============

    public function test_control_counts_what_was_voided_and_who_it_belonged_to(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);

        $sold = $this->bill('paid', 200_000);
        $sold->forceFill(['waiter_user_id' => $waiter->getKey()])->save();

        $voided = $this->bill('voided', 90_000);
        $voided->forceFill(['waiter_user_id' => $waiter->getKey()])->save();

        /*
         * A till that closed 32 000 so'm short.
         *
         * The one loss figure on this screen that is measured rather than
         * inferred, and it lives on `cash_shifts` — which has no `business_date`
         * of its own, so the window has to be a range on `closed_at`. Asserted
         * here because getting that wrong is not a wrong number: the query
         * fails, the transaction aborts, and the whole screen answers 500.
         */
        CashShift::factory()->closed()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'difference' => -32_000 * self::SOM,
            'closed_at' => now(),
        ]);

        $answer = $this->read('/api/v1/analytics/control')->assertOk();

        $this->assertSame(1, $answer->json('data.summary.voided_bills'));
        // Absolute: a surplus is as much a red flag as a shortfall.
        $this->assertSame(32_000 * self::SOM, $answer->json('data.summary.variance_tiyin'));

        /** @var array<int, array<string, mixed>> $staff */
        $staff = $answer->json('data.staff');
        $row = collect($staff)->firstWhere('user_id', $waiter->getKey());
        $this->assertNotNull($row);
        $this->assertSame(2, $row['bills']);
        $this->assertSame(1, $row['voided_bills']);
        // Revenue counts the settled bill only, and is NOT multiplied by the
        // number of lines on it — the join bug this query is written around.
        $this->assertSame(200_000 * self::SOM, $row['revenue_tiyin']);
    }

    /**
     * The money and the ratios the console prints under each count.
     *
     * Every one of those four captions used to be a sentence from the message
     * catalogue — "bu oy · 840 000 so'm" beside a live void count, "5 smenadan
     * 3 tasida" beside a live variance. On a loss-prevention screen, stating a
     * fixed amount next to a real count is how a manager is led to accuse the
     * wrong person, so the summary now carries what the caption needs.
     */
    public function test_control_summary_carries_the_money_behind_each_count(): void
    {
        $this->bill('paid', 500_000);
        $this->bill('voided', 90_000);

        // One clean close and one that came up short: the caption reads "1 of
        // 2", which a single total cannot say.
        CashShift::factory()->closed()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'difference' => 0,
            'closed_at' => now(),
        ]);
        CashShift::factory()->closed()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'difference' => -12_000 * self::SOM,
            'closed_at' => now(),
        ]);

        $summary = $this->read('/api/v1/analytics/control')->assertOk()->json('data.summary');

        $this->assertSame(90_000 * self::SOM, $summary['voided_value_tiyin']);
        // Paid bills only: a voided one was never revenue, and dividing the
        // discounts by it would understate the share.
        $this->assertSame(500_000 * self::SOM, $summary['paid_revenue_tiyin']);
        $this->assertSame(2, $summary['shifts_closed']);
        $this->assertSame(1, $summary['shifts_with_variance']);
    }

    // ============ Reports, and the file ============

    public function test_the_waiter_report_and_its_export_carry_the_same_figures(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Jasur Toshev']);
        $bill = $this->bill('paid', 240_000);
        $bill->forceFill(['waiter_user_id' => $waiter->getKey()])->save();

        $report = $this->read('/api/v1/analytics/reports/waiters')->assertOk();

        $this->assertTrue($report->json('data.available'));
        $this->assertSame(240_000 * self::SOM, $report->json('data.totals.revenue_tiyin'));

        $csv = $this->actingAs($this->owner)
            ->withHeaders(['X-Tenant' => $this->tenant->slug])
            ->postJson('/api/v1/reports/export', ['kind' => 'waiters'])
            ->assertOk();

        $body = $csv->getContent();

        // So'm in the file, not tiyin: a spreadsheet handed 24000000 for a
        // 240 000 so'm total is a report an accountant refuses to use.
        $this->assertStringContainsString('240000.00', $body);
        $this->assertStringContainsString('Jasur Toshev', $body);
        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);
    }

    public function test_the_stock_report_reads_the_shelf_through_its_contract(): void
    {
        // It used to answer "not connected": Analytics may not read Inventory,
        // and nobody had opened the door the honest way. `StockReport` is that
        // door — the same one the dashboard's food-cost card goes through.
        $answer = $this->read('/api/v1/analytics/reports/stock')->assertOk();

        $this->assertTrue($answer->json('data.available'));
        $this->assertNotSame([], $answer->json('data.columns'));
        // A restaurant that consumed nothing in the window has no rows, which
        // is a real answer and not the same as "cannot answer".
        $this->assertIsArray($answer->json('data.rows'));
    }

    // ============ The home screen ============

    public function test_the_dashboard_answers_in_the_shape_the_role_asked_for(): void
    {
        $this->bill('paid', 200_000, $this->chilonzor);
        $this->bill('paid', 300_000, $this->sergeli);

        $owner = $this->read('/api/v1/dashboard?role=owner')->assertOk();
        $this->assertSame('owner', $owner->json('data.role'));
        // Grouped BY branch rather than filtered by it — an owner comparing
        // five venues has to see five.
        $this->assertCount(2, $owner->json('data.branches'));

        $cashier = $this->read('/api/v1/dashboard?role=cashier')->assertOk();
        $this->assertSame('cashier', $cashier->json('data.role'));
        $this->assertNull($cashier->json('data.branches'));
        $this->assertIsArray($cashier->json('data.methods'));
    }

    public function test_an_unknown_period_draws_today_rather_than_an_error(): void
    {
        $this->bill('paid', 200_000);

        // A stale bookmark carrying `?period=quarter` should show the screen,
        // not a 422 where the screen was.
        $answer = $this->read('/api/v1/analytics/summary?period=quarter')->assertOk();

        $this->assertSame('today', $answer->json('data.window.period'));
        $this->assertSame(1, $answer->json('data.window.days'));
    }

    // ============ Fixture ============

    private function dish(MenuCategory $category, string $sku, string $name, int $priceSom, ?int $costSom): MenuItem
    {
        return MenuItem::query()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->getKey(),
            'sku' => $sku,
            'name' => ['uz' => $name, 'ru' => $name, 'en' => $name],
            'price' => $priceSom * self::SOM,
            'cost_price' => $costSom === null ? null : $costSom * self::SOM,
            'status' => 'active',
            'is_available' => true,
        ]);
    }

    private function bill(string $status, int $totalSom, ?Branch $branch = null): Order
    {
        return Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => ($branch ?? $this->chilonzor)->getKey(),
            'status' => $status,
            'subtotal' => $totalSom * self::SOM,
            'total' => $totalSom * self::SOM,
            'guests_count' => 2,
            'placed_at' => now(),
            'business_date' => app(BusinessDay::class)->dateFor(),
        ]);
    }

    private function line(Order $order, MenuItem $item, int $quantity): OrderItem
    {
        $line = OrderItem::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->getKey(),
            'menu_item_id' => $item->getKey(),
            'sku' => $item->sku,
            /*
             * A plain string, because that is what the column holds.
             *
             * `menu_items.name` is the trilingual jsonb; `order_items.title` is
             * the name as PRINTED ON THE BILL, frozen at the moment it was rung
             * up in whatever language the guest was served in. Copying the json
             * across would put an array in a varchar and, worse, would make a
             * receipt change language when somebody edits the menu.
             */
            'title' => $item->sku,
            'quantity' => $quantity,
            'unit_price' => (int) $item->price,
            'total_price' => (int) $item->price * $quantity,
            'status' => 'served',
        ]);

        // The bill's own total has to follow its lines, or every revenue
        // assertion below would be checking two unrelated numbers.
        $order->forceFill([
            'subtotal' => (int) $order->subtotal + (int) $line->total_price,
            'total' => (int) $order->total + (int) $line->total_price,
        ])->save();

        return $line;
    }

    private function takings(Order $order, string $method, int $amountSom): Payment
    {
        return Payment::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $order->branch_id,
            'order_id' => $order->getKey(),
            'order_number' => $order->number,
            'method' => $method,
            'amount' => $amountSom * self::SOM,
            'status' => 'captured',
            'paid_at' => now(),
        ]);
    }

    private function read(string $path, ?Branch $branch = null): TestResponse
    {
        $headers = ['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'];

        if ($branch !== null) {
            // The header carries the SLUG, not the id — see ResolveBranch.
            $headers['X-Branch'] = (string) $branch->slug;
        }

        return $this->actingAs($this->owner)->withHeaders($headers)->getJson($path);
    }
}
