<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Analytics\Models\DailyFact;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\FixedAsset;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * The statement keyed by a calendar month.
 *
 * Every other report in this module takes `?period=today|week|month`, where
 * `month` is the trailing thirty trading days. That is right for a dashboard and
 * wrong for a document with a month's name at the top of it — which is what this
 * endpoint exists to answer, and what most of these tests are checking: that
 * "July" means July and not the last thirty days.
 */
final class ProfitAndLossTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The clock, pinned.
     *
     * Every figure here is about a MONTH, and "now" decides which one. Left to
     * the wall clock this suite passes all day and fails between midnight and
     * 06:00, because the venue's trading day has not turned over and
     * `Carbon::now()->subMonth()` stops agreeing with the server about which
     * month finished. A test that only fails at four in the morning is a test
     * nobody trusts.
     */
    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-08-20 15:00:00'));

        $this->seed(RolesAndPermissionsSeeder::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    private function lastMonth(): string
    {
        return Carbon::now()->subMonthNoOverflow()->format('Y-m');
    }

    /** One roll-up row — `branch_id` null, which is the business-wide figure. */
    private function fact(string $date, array $figures = [], ?int $branchId = null): DailyFact
    {
        return DailyFact::query()->create([
            'branch_id' => $branchId,
            'business_date' => $date,
            'computed_at' => now(),
            ...$figures,
        ]);
    }

    public function test_a_month_is_the_month_and_not_the_last_thirty_days(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();
        $first = $month.'-01';
        $last = Carbon::parse($first)->endOfMonth()->toDateString();

        $this->fact($first, ['revenue_tiyin' => 112_000_000]);
        $this->fact($last, ['revenue_tiyin' => 112_000_000]);
        // The day after the month ends. A trailing window would swallow it.
        $this->fact(Carbon::parse($last)->addDay()->toDateString(), ['revenue_tiyin' => 999_000_000]);

        $data = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")->assertOk()->json('data');

        $this->assertSame($month, $data['month']);
        $this->assertSame(224_000_000, $data['revenue']['gross_tiyin']);
        // VAT out at the restaurant's own 12%: 224 000 000 × 100 ÷ 112.
        $this->assertSame(200_000_000, $data['revenue']['net_tiyin']);
        $this->assertSame(2, $data['source']['days']);
    }

    public function test_the_comparison_column_is_the_month_before(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();
        $before = Carbon::parse($month.'-01')->subMonthNoOverflow()->format('Y-m');

        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000]);
        $this->fact($before.'-05', ['revenue_tiyin' => 56_000_000]);

        $data = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")->assertOk()->json('data');

        $this->assertSame($before, $data['previous_month']);
        $this->assertSame(100_000_000, $data['revenue']['net_tiyin']);
        $this->assertSame(50_000_000, $data['revenue']['previous_net_tiyin']);
        // Cast, because `round(100.0, 1)` encodes as `100` and decodes as an
        // int — the delta is a float everywhere it is not exactly whole.
        $this->assertSame(100.0, (float) $data['revenue']['delta_percent']);
    }

    public function test_a_first_month_has_no_percentage_rather_than_zero(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();
        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000]);

        // "+0.0%" would claim this month matched a month that does not exist.
        $this->assertNull(
            $this->getJson("/api/v1/analytics/profit-loss?month={$month}")
                ->assertOk()->json('data.revenue.delta_percent'),
        );
    }

    public function test_expenses_arrive_split_by_the_heading_they_were_filed_under(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();
        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000]);

        foreach ([['rent', 20_000_000], ['rent', 4_000_000], ['marketing', 6_000_000]] as [$category, $amount]) {
            Expense::query()->create([
                'category' => $category,
                'description' => $category,
                'amount' => $amount,
                'spent_at' => $month.'-07 12:00:00',
            ]);
        }

        // Outside the window, and it must not reach the statement.
        Expense::query()->create([
            'category' => 'repair',
            'description' => 'Keyingi oy',
            'amount' => 50_000_000,
            'spent_at' => Carbon::parse($month.'-01')->addMonthNoOverflow()->addDays(3)->toDateTimeString(),
        ]);

        $data = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")->assertOk()->json('data');

        // Two headings, biggest first — the split `daily_facts.expenses_tiyin`
        // cannot give and a statement cannot do without.
        $this->assertCount(2, $data['expenses']);
        $this->assertSame('rent', $data['expenses'][0]['category']);
        $this->assertSame(24_000_000, $data['expenses'][0]['amount_tiyin']);
        $this->assertSame(2, $data['expenses'][0]['entries']);
        $this->assertSame(30_000_000, $data['expenses_total_tiyin']);
    }

    public function test_the_depreciation_line_comes_from_the_register(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();
        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000]);

        // 6 000 000 so'm over 60 months, bought two years ago: 10 000 000 tiyin
        // a month. The line the statement was missing, and the reason a fit-out
        // used to wipe out the month it was bought in.
        FixedAsset::query()->create([
            'name' => 'Ventilyatsiya',
            'category' => 'fit_out',
            'acquired_on' => Carbon::parse($month.'-01')->subMonthsNoOverflow(24)->toDateString(),
            'cost' => 600_000_000,
            'useful_life_months' => 60,
        ]);

        $data = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")->assertOk()->json('data');

        $this->assertSame(10_000_000, $data['depreciation_tiyin']);
        // EBITDA is before it, operating profit after — both published, so no
        // reader has to subtract one from the other and get it wrong.
        $this->assertSame(
            $data['totals']['ebitda_tiyin'] - 10_000_000,
            $data['totals']['operating_profit_tiyin'],
        );
    }

    public function test_the_business_total_is_not_the_sum_of_its_venues_plus_itself(): void
    {
        $this->actingAsOwner();

        $branch = Branch::factory()->create();
        $month = $this->lastMonth();

        // The rollup row and the venue row for the same day. `BelongsToBranch`
        // does not filter on an unset branch, so a naive sum would count the
        // group total AND the venue that makes it up.
        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000]);
        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000], $branch->id);

        $business = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")
            ->assertOk()->json('data.revenue.gross_tiyin');

        $this->assertSame(112_000_000, $business);

        $venue = $this->getJson("/api/v1/analytics/profit-loss?month={$month}&branch={$branch->id}")
            ->assertOk()->json('data.revenue.gross_tiyin');

        $this->assertSame(112_000_000, $venue);
    }

    public function test_the_coverage_travels_with_the_cost_of_sales(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();

        // A quiet day where everything sold was costed, and a busy one where
        // almost nothing was. Averaged across days the coverage would read 55%;
        // weighted by takings — which is what the percentage is a share of — it
        // is the busy day that decides.
        $this->fact($month.'-05', ['revenue_tiyin' => 10_000_000, 'cogs_tiyin' => 3_000_000, 'cogs_coverage_percent' => 100]);
        $this->fact($month.'-06', ['revenue_tiyin' => 90_000_000, 'cogs_tiyin' => 9_000_000, 'cogs_coverage_percent' => 10]);

        $data = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")->assertOk()->json('data');

        $this->assertSame(12_000_000, $data['cost_of_sales']['tiyin']);
        $this->assertSame(19, $data['cost_of_sales']['coverage_percent']);
    }

    public function test_the_revenue_split_comes_from_the_menu_rather_than_the_projection(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();
        $this->fact($month.'-05', ['revenue_tiyin' => 112_000_000]);

        $drinks = MenuCategory::factory()->create(['slug' => 'ichimliklar']);
        $grill = MenuCategory::factory()->create(['slug' => 'shashliklar']);

        $order = Order::factory()->paid()->create([
            'business_date' => $month.'-05',
            'placed_at' => $month.'-05 19:00:00',
        ]);

        foreach ([[$drinks, 12_000_000], [$grill, 100_000_000]] as [$category, $revenue]) {
            $dish = MenuItem::factory()->create(['menu_category_id' => $category->id]);

            OrderItem::factory()->create([
                'order_id' => $order->id,
                'menu_item_id' => $dish->id,
                'quantity' => 1,
                'unit_price' => $revenue,
                'total_price' => $revenue,
                'status' => 'ready',
            ]);
        }

        $split = $this->getJson("/api/v1/analytics/profit-loss?month={$month}")
            ->assertOk()->json('data.revenue_by_category');

        // Biggest first, keyed by slug — a name is jsonb in three languages and
        // a client grouping by it would be grouping by whichever one it read.
        $this->assertCount(2, $split);
        $this->assertSame('shashliklar', $split[0]['slug']);
        $this->assertSame(100_000_000, $split[0]['revenue_tiyin']);
        $this->assertSame('ichimliklar', $split[1]['slug']);
        $this->assertSame(12_000_000, $split[1]['revenue_tiyin']);
    }

    public function test_a_malformed_month_falls_back_to_the_one_that_finished(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/profit-loss?month=iyul')
            ->assertOk()
            ->assertJsonPath('data.month', $this->lastMonth());
    }

    public function test_a_waiter_cannot_read_the_statement(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/analytics/profit-loss')->assertStatus(403);
    }
}
