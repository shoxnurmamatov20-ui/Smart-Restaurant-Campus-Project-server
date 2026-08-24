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
use Illuminate\Testing\TestResponse;
use Modules\Analytics\Models\DailyFact;
use Tests\TestCase;

/**
 * Every venue side by side — GET /api/v1/analytics/branches?period=
 *
 * The report is fed by `analytics.daily_facts` and by nothing else, so the
 * fixtures here are rows of that table rather than bills and shifts.
 * `DailyRollupTest` is what proves the projection is built correctly from the
 * trade underneath it; repeating that here would test the rollup twice and this
 * report not at all.
 *
 * The figures are asserted exactly. A comparison table whose test only checked
 * that five rows came back would pass with every percentage zero, which is
 * precisely how a report like this fails — quietly, on the column nobody can
 * check by eye.
 */
final class BranchPerformanceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $owner;

    private Branch $chilonzor;

    private Branch $yunusobod;

    private string $today;

    private string $yesterday;

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
        $this->yunusobod = Branch::factory()->named('Yunusobod', 'YUN')->create(['tenant_id' => $this->tenant->id]);

        $this->owner = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            // Unpinned, so an owner reads every venue — which is what makes the
            // pinned-manager case below mean anything.
            'branch_id' => null,
        ]);
        $this->owner->assignRole('owner');

        $this->today = app(BusinessDay::class)->dateFor();
        $this->yesterday = CarbonImmutable::parse($this->today)->subDay()->toDateString();
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    // ============ Fixtures ============

    /**
     * One venue's projected day.
     *
     * `takings_tiyin` defaults to the revenue rather than to zero, because a
     * day where everything rung up was also banked is the ordinary one — and
     * leaving it at zero would trip the unbanked guard-rail on every fixture
     * that did not think about it. A test that wants a credit sale says so.
     *
     * @param  array<string, int>  $figures
     */
    private function fact(Branch $at, string $day, array $figures, ?Tenant $of = null): void
    {
        $figures['takings_tiyin'] ??= $figures['revenue_tiyin'] ?? 0;

        DailyFact::query()->create(array_merge([
            'tenant_id' => ($of ?? $this->tenant)->getKey(),
            'branch_id' => $at->getKey(),
            'business_date' => $day,
            'revenue_tiyin' => 0,
            'takings_tiyin' => 0,
            'discounts_tiyin' => 0,
            'expenses_tiyin' => 0,
            'cogs_tiyin' => 0,
            'cogs_coverage_percent' => 0,
            'labour_tiyin' => 0,
            'waste_tiyin' => 0,
            'orders_count' => 0,
            'guests_count' => 0,
            'computed_at' => now(),
        ], $figures));
    }

    /** This venue's own monthly target, in tiyin — the console's ± stepper writes here. */
    private function target(Branch $at, int $tiyin): void
    {
        $at->forceFill(['settings' => ['target_monthly_tiyin' => $tiyin]])->save();
    }

    private function read(string $period = 'today'): TestResponse
    {
        return $this->actingAs($this->owner)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson("/api/v1/analytics/branches?period={$period}");
    }

    /**
     * One venue's row out of the answer, found by name rather than by index.
     *
     * The report is sorted biggest first, so a test that reached for
     * `branches.0` would silently start asserting about a different venue the
     * moment a fixture's revenue changed.
     *
     * @return array<string, mixed>
     */
    private static function venue(TestResponse $answer, string $name): array
    {
        /** @var array<int, array<string, mixed>> $rows */
        $rows = $answer->json('data.branches') ?? [];

        foreach ($rows as $row) {
            if (($row['name'] ?? null) === $name) {
                return $row;
            }
        }

        return [];
    }

    // ============ The nine columns ============

    public function test_two_venues_come_back_side_by_side_with_every_column_answered(): void
    {
        // 1 000 000 so'm across ten bills. 30% of it food, 20% wages, 5% given
        // away, every som of it banked, and the whole menu costed.
        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 1_000_000_00,
            'discounts_tiyin' => 50_000_00,
            'cogs_tiyin' => 300_000_00,
            'cogs_coverage_percent' => 100,
            'labour_tiyin' => 200_000_00,
            'orders_count' => 10,
            'guests_count' => 25,
        ]);

        // Half the trade, and worse on every ratio.
        $this->fact($this->yunusobod, $this->today, [
            'revenue_tiyin' => 500_000_00,
            'takings_tiyin' => 400_000_00,
            'discounts_tiyin' => 100_000_00,
            'cogs_tiyin' => 200_000_00,
            'cogs_coverage_percent' => 80,
            'labour_tiyin' => 200_000_00,
            'orders_count' => 4,
            'guests_count' => 9,
        ]);

        /*
         * The business roll-up lives in the same table with a null branch. If
         * the report failed to exclude it, it would appear here as a third
         * venue carrying the sum of the other two — a restaurant that earned
         * twice, on the screen that compares its branches.
         */
        DailyFact::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => null,
            'business_date' => $this->today,
            'revenue_tiyin' => 1_500_000_00,
            'takings_tiyin' => 1_400_000_00,
            'orders_count' => 14,
            'computed_at' => now(),
        ]);

        $answer = $this->read()->assertOk();

        $this->assertCount(2, $answer->json('data.branches'));
        // Biggest first — the screen's share rail is drawn against the leader.
        $this->assertSame('Chilonzor', $answer->json('data.branches.0.name'));
        $this->assertSame('today', $answer->json('data.window.period'));

        $best = self::venue($answer, 'Chilonzor');

        $this->assertSame(1_000_000_00, $best['revenue_tiyin']);
        $this->assertSame(10, $best['orders_count']);
        $this->assertSame(25, $best['guests_count']);
        // Per bill: 1 000 000 over ten of them.
        $this->assertSame(100_000_00, $best['average_cheque_tiyin']);
        $this->assertSame(30, $best['food_cost_percent']);
        // Margin and food cost are two readings of one figure and must sum to
        // 100 exactly — a row showing 62% margin beside 39% food cost is the
        // bug this assertion exists for.
        $this->assertSame(70, $best['margin_percent']);
        $this->assertSame(20, $best['labour_percent']);
        $this->assertSame(100, $best['cogs_coverage_percent']);

        $worse = self::venue($answer, 'Yunusobod');

        $this->assertSame(500_000_00, $worse['revenue_tiyin']);
        $this->assertSame(125_000_00, $worse['average_cheque_tiyin']);
        // Every percentage is of THIS venue's own revenue, which is the only
        // way a small room and a big one can be read on the same row.
        $this->assertSame(40, $worse['food_cost_percent']);
        $this->assertSame(60, $worse['margin_percent']);
        $this->assertSame(40, $worse['labour_percent']);
        $this->assertSame(80, $worse['cogs_coverage_percent']);
    }

    public function test_a_month_is_summed_across_its_days_rather_than_read_from_one(): void
    {
        // Three trading days inside the thirty-day window, one outside it.
        foreach ([0, 1, 2] as $back) {
            $this->fact($this->chilonzor, CarbonImmutable::parse($this->today)->subDays($back)->toDateString(), [
                'revenue_tiyin' => 100_000_00,
                'cogs_tiyin' => 30_000_00,
                'cogs_coverage_percent' => 100,
                'labour_tiyin' => 25_000_00,
                'orders_count' => 2,
            ]);
        }

        $this->fact($this->chilonzor, CarbonImmutable::parse($this->today)->subDays(40)->toDateString(), [
            'revenue_tiyin' => 900_000_00,
            'orders_count' => 9,
        ]);

        $row = self::venue($this->read('month')->assertOk(), 'Chilonzor');

        $this->assertSame(300_000_00, $row['revenue_tiyin']);
        $this->assertSame(6, $row['orders_count']);
        $this->assertSame(30, $row['food_cost_percent']);
        $this->assertSame(25, $row['labour_percent']);
    }

    // ============ The delta ============

    public function test_the_delta_is_measured_against_the_previous_window_of_the_same_length(): void
    {
        // Up a fifth.
        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 1_200_000_00, 'orders_count' => 12]);
        $this->fact($this->chilonzor, $this->yesterday, ['revenue_tiyin' => 1_000_000_00, 'orders_count' => 10]);

        // Down a fifth. Both directions, because a report that took an absolute
        // difference would report the fall as a rise.
        $this->fact($this->yunusobod, $this->today, ['revenue_tiyin' => 800_000_00, 'orders_count' => 8]);
        $this->fact($this->yunusobod, $this->yesterday, ['revenue_tiyin' => 1_000_000_00, 'orders_count' => 10]);

        $answer = $this->read()->assertOk();

        $this->assertSame(20, self::venue($answer, 'Chilonzor')['delta_percent']);
        $this->assertSame(-20, self::venue($answer, 'Yunusobod')['delta_percent']);
    }

    public function test_yesterdays_trade_never_leaks_into_todays_figures(): void
    {
        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 300_000_00, 'orders_count' => 3]);
        $this->fact($this->chilonzor, $this->yesterday, ['revenue_tiyin' => 900_000_00, 'orders_count' => 9]);

        $row = self::venue($this->read()->assertOk(), 'Chilonzor');

        // The previous window is compared against, not added in.
        $this->assertSame(300_000_00, $row['revenue_tiyin']);
        $this->assertSame(3, $row['orders_count']);
    }

    public function test_a_venue_that_did_not_trade_last_window_reports_no_change_rather_than_a_rise(): void
    {
        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 500_000_00, 'orders_count' => 5]);

        // There is no percentage change from nothing, and "+100%" for a branch
        // that opened last Tuesday is a number somebody screenshots.
        $this->assertSame(0, self::venue($this->read()->assertOk(), 'Chilonzor')['delta_percent']);
    }

    // ============ The venue that took nothing ============

    public function test_a_venue_with_no_projected_rows_answers_zeros_rather_than_dividing_by_zero(): void
    {
        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 1_000_000_00,
            'cogs_tiyin' => 300_000_00,
            'cogs_coverage_percent' => 100,
            'labour_tiyin' => 200_000_00,
            'orders_count' => 10,
        ]);

        // Closed for refurbishment, and carrying a target it obviously cannot
        // meet. It must still appear — a venue that vanished from the table
        // reads as a venue that was never opened.
        $this->target($this->yunusobod, 30_000_000_00);

        $row = self::venue($this->read()->assertOk(), 'Yunusobod');

        $this->assertSame(0, $row['revenue_tiyin']);
        $this->assertSame(0, $row['orders_count']);
        $this->assertSame(0, $row['average_cheque_tiyin']);
        $this->assertSame(0, $row['margin_percent']);
        $this->assertSame(0, $row['labour_percent']);
        $this->assertSame(0, $row['food_cost_percent']);
        $this->assertSame(0, $row['delta_percent']);
        // Every rail is a share of revenue, and an absence has no share to be
        // below. A closed venue lighting up the alert column is how a real one
        // gets ignored.
        $this->assertSame(0, $row['open_alerts']);
        // The target it has is still reported — the screen draws the stepper
        // from it whether or not the venue traded.
        $this->assertSame(30_000_000_00, $row['target_monthly_tiyin']);
    }

    // ============ open_alerts, whose definition this report had to invent ============

    public function test_a_venue_inside_every_rail_raises_no_alerts(): void
    {
        // Thirty times the day's takings, so a one-day window's slice of the
        // month's target is exactly what the venue took: 100% attained.
        $this->target($this->chilonzor, 30_000_000_00);

        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 1_000_000_00,
            'discounts_tiyin' => 50_000_00,     //  5% — under 10
            'cogs_tiyin' => 300_000_00,         // 30% — under 35
            'cogs_coverage_percent' => 100,
            'labour_tiyin' => 200_000_00,       // 20% — under 30
            'orders_count' => 10,
        ]);

        $this->assertSame(0, self::venue($this->read()->assertOk(), 'Chilonzor')['open_alerts']);
    }

    public function test_each_rail_a_venue_crosses_counts_once(): void
    {
        // No target, so the attainment rail cannot fire: four of the five.
        $this->fact($this->yunusobod, $this->today, [
            'revenue_tiyin' => 500_000_00,
            'takings_tiyin' => 400_000_00,      // a fifth never banked — over 5
            'discounts_tiyin' => 100_000_00,    // 20% given away  — over 10
            'cogs_tiyin' => 200_000_00,         // 40% food cost   — over 35
            'cogs_coverage_percent' => 80,
            'labour_tiyin' => 200_000_00,       // 40% payroll     — over 30
            'orders_count' => 4,
        ]);

        $this->assertSame(4, self::venue($this->read()->assertOk(), 'Yunusobod')['open_alerts']);
    }

    public function test_a_venue_short_of_its_own_target_raises_that_rail_and_only_that_one(): void
    {
        // A month's target of 60 000 000 so'm is 2 000 000 a day; the venue took
        // half of it. Every other ratio is inside its rail.
        $this->target($this->chilonzor, 60_000_000_00);

        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 1_000_000_00,
            'discounts_tiyin' => 50_000_00,
            'cogs_tiyin' => 300_000_00,
            'cogs_coverage_percent' => 100,
            'labour_tiyin' => 200_000_00,
            'orders_count' => 10,
        ]);

        $this->assertSame(1, self::venue($this->read()->assertOk(), 'Chilonzor')['open_alerts']);
    }

    public function test_a_venue_with_no_target_is_not_judged_against_one(): void
    {
        // The same trade as the case above, with nobody having set a target.
        // A branch nobody has configured has no rail to cross, and an alert on
        // it would send a manager looking for a trading problem that is really
        // a settings one.
        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 1_000_000_00,
            'discounts_tiyin' => 50_000_00,
            'cogs_tiyin' => 300_000_00,
            'cogs_coverage_percent' => 100,
            'labour_tiyin' => 200_000_00,
            'orders_count' => 10,
        ]);

        $row = self::venue($this->read()->assertOk(), 'Chilonzor');

        $this->assertSame(0, $row['open_alerts']);
        $this->assertSame(0, $row['target_monthly_tiyin']);
    }

    // ============ The uncosted menu ============

    public function test_an_uncosted_menu_reports_no_margin_rather_than_all_of_it(): void
    {
        // Nothing sold here has a recipe cost, so the cost base is empty.
        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 1_000_000_00,
            'cogs_tiyin' => 0,
            'cogs_coverage_percent' => 0,
            'labour_tiyin' => 200_000_00,
            'orders_count' => 10,
        ]);

        $row = self::venue($this->read()->assertOk(), 'Chilonzor');

        // A 100% margin because nobody has costed the menu is the single most
        // flattering possible lie about a kitchen. The coverage beside it is
        // what tells "no margin" apart from "nothing to compute one from".
        $this->assertSame(0, $row['margin_percent']);
        $this->assertSame(0, $row['food_cost_percent']);
        $this->assertSame(0, $row['cogs_coverage_percent']);
        // And it raises no food-cost alert: a zero cost base is not a cheap
        // kitchen.
        $this->assertSame(0, $row['open_alerts']);
    }

    public function test_coverage_is_weighted_by_the_days_revenue_rather_than_averaged(): void
    {
        // A busy fully costed day and a quiet uncosted one. A flat average of
        // the two would report 50%; the weighted share is 90.
        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 900_000_00,
            'cogs_tiyin' => 300_000_00,
            'cogs_coverage_percent' => 100,
            'orders_count' => 9,
        ]);
        $this->fact($this->chilonzor, $this->yesterday, [
            'revenue_tiyin' => 100_000_00,
            'cogs_coverage_percent' => 0,
            'orders_count' => 1,
        ]);

        $this->assertSame(90, self::venue($this->read('week')->assertOk(), 'Chilonzor')['cogs_coverage_percent']);
    }

    // ============ Headcount ============

    public function test_the_headcount_is_this_venues_own_active_people(): void
    {
        User::factory()->count(3)->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->getKey(),
        ]);

        // Suspended: keeps their history, cannot sign in, is not on the rota.
        User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->getKey(),
            'is_active' => false,
        ]);

        User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->yunusobod->getKey(),
        ]);

        // Another restaurant's employee, pinned to a branch id that happens to
        // be one of ours. `public.users` carries no global tenant scope, so a
        // report that forgot to scope it by hand would count this person.
        $elsewhere = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        User::factory()->create([
            'tenant_id' => $elsewhere->getKey(),
            'branch_id' => $this->chilonzor->getKey(),
        ]);

        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 900_000_00, 'orders_count' => 9]);
        $this->fact($this->yunusobod, $this->today, ['revenue_tiyin' => 100_000_00, 'orders_count' => 1]);

        $answer = $this->read()->assertOk();

        $this->assertSame(3, self::venue($answer, 'Chilonzor')['staff_count']);
        $this->assertSame(1, self::venue($answer, 'Yunusobod')['staff_count']);
    }

    public function test_somebody_who_works_across_the_estate_is_counted_at_no_venue(): void
    {
        // The owner from setUp() is unpinned. The column asks how many people
        // work at this address; one owner appearing on all five rows would
        // answer a different question, and a wrong one.
        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 100_000_00, 'orders_count' => 1]);

        $this->assertSame(0, self::venue($this->read()->assertOk(), 'Chilonzor')['staff_count']);
    }

    // ============ The window vocabulary ============

    public function test_an_unknown_period_is_refused_rather_than_quietly_answered_for_today(): void
    {
        // `ReportWindow::of()` clamps an unrecognised period to `today` for the
        // screens that draw a dashboard. This one validates instead: a client
        // asking for `?period=quarter` and silently receiving ONE DAY of five
        // venues would compare them against a month's target and report every
        // one of them as failing.
        $this->actingAs($this->owner)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/branches?period=quarter')
            ->assertApiValidationErrors('period');
    }

    public function test_no_period_at_all_is_the_trading_day(): void
    {
        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 100_000_00, 'orders_count' => 1]);

        $this->actingAs($this->owner)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/branches')
            ->assertOk()
            ->assertJsonPath('data.window.period', 'today')
            ->assertJsonPath('data.window.days', 1);
    }

    // ============ Who may read it ============

    public function test_a_waiter_cannot_read_the_comparison(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => null]);
        $waiter->assignRole('waiter');

        $this->actingAs($waiter)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/branches?period=today')
            ->assertForbidden();
    }

    public function test_a_manager_pinned_to_one_venue_reads_that_venue_and_no_other(): void
    {
        $this->fact($this->chilonzor, $this->today, ['revenue_tiyin' => 900_000_00, 'orders_count' => 9]);
        $this->fact($this->yunusobod, $this->today, ['revenue_tiyin' => 100_000_00, 'orders_count' => 1]);

        $manager = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->yunusobod->getKey(),
        ]);
        $manager->assignRole('branch-manager');

        $answer = $this->actingAs($manager)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/branches?period=today')
            ->assertOk();

        // An empty branch is a roll-up and a pinned one is a filter. Otherwise
        // this endpoint would be a way to read the whole estate from inside a
        // single venue.
        $this->assertCount(1, $answer->json('data.branches'));
        $this->assertSame('Yunusobod', $answer->json('data.branches.0.name'));
    }

    // ============ Isolation ============

    public function test_another_restaurant_sees_none_of_it(): void
    {
        $this->fact($this->chilonzor, $this->today, [
            'revenue_tiyin' => 9_000_000_00,
            'cogs_tiyin' => 3_000_000_00,
            'cogs_coverage_percent' => 100,
            'orders_count' => 90,
        ]);

        $elsewhere = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $theirs = Branch::factory()->named('Buxoro', 'BUX')->create(['tenant_id' => $elsewhere->getKey()]);
        $this->fact($theirs, $this->today, ['revenue_tiyin' => 200_000_00, 'orders_count' => 2], $elsewhere);

        $stranger = User::factory()->create(['tenant_id' => $elsewhere->getKey(), 'branch_id' => null]);
        $stranger->assignRole('owner');

        $answer = $this->actingAs($stranger)
            ->withHeaders(['X-Tenant' => $elsewhere->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/analytics/branches?period=today')
            ->assertOk();

        // Their own venue, their own figure, and neither of ours — not even as
        // an empty row, which would still disclose that the branch exists.
        $this->assertCount(1, $answer->json('data.branches'));
        $this->assertSame('Buxoro', $answer->json('data.branches.0.name'));
        $this->assertSame(200_000_00, $answer->json('data.branches.0.revenue_tiyin'));
    }
}
