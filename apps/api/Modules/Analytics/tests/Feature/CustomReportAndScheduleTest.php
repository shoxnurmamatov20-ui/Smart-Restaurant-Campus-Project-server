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
use Illuminate\Support\Facades\Mail;
use Modules\Analytics\Models\DailyFact;
use Modules\Analytics\Models\ReportSchedule;
use Tests\TestCase;

/**
 * The builder and the schedule sheet — the two halves of the reports screen
 * that used to confirm what would have happened and write nothing.
 *
 * The assertions that matter are the arithmetic ones. A builder test that
 * checked only "some rows came back" would pass with every figure doubled,
 * which is exactly the failure available here: `daily_facts` holds a row per
 * venue AND a roll-up row per restaurant, and summing both counts every so'm
 * twice.
 */
final class CustomReportAndScheduleTest extends TestCase
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

        $this->chilonzor = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $this->yunusobod = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Yunusobod', 'slug' => 'yunusobod',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->today = app(BusinessDay::class)->dateFor();
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /** One projected trading day, for one venue or for the business. */
    private function fact(?Branch $branch, string $day, int $revenue, int $orders, int $labour = 0, int $waste = 0): void
    {
        DailyFact::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch?->id,
            'business_date' => $day,
            'revenue_tiyin' => $revenue,
            'takings_tiyin' => $revenue,
            'cogs_tiyin' => (int) round($revenue * 0.3),
            'expenses_tiyin' => 0,
            'labour_tiyin' => $labour,
            'waste_tiyin' => $waste,
            'orders_count' => $orders,
            'guests_count' => $orders * 2,
            'computed_at' => now(),
        ]);
    }

    // ============ The builder ============

    public function test_the_column_catalogue_is_what_the_picker_may_offer(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/report-columns')
            ->assertOk()
            ->assertJsonPath('data.bases', ['sales', 'fin', 'stock', 'staff'])
            ->assertJsonPath('data.groups', ['day', 'week', 'month', 'branch'])
            ->assertJsonPath('data.columns.sales.revenue', 'money')
            ->assertJsonPath('data.columns.staff.labour_percent', 'percent');
    }

    public function test_a_report_grouped_by_day_reads_the_rollup_and_never_doubles(): void
    {
        $this->actingAsOwner();

        // Two venues and the business-wide roll-up for the same day — which is
        // exactly what `analytics:rollup` writes.
        $this->fact($this->chilonzor, $this->today, 600_000, 6);
        $this->fact($this->yunusobod, $this->today, 400_000, 4);
        $this->fact(null, $this->today, 1_000_000, 10);

        $this->postJson('/api/v1/analytics/reports/custom', [
            'base' => 'sales',
            'group_by' => 'day',
            'period' => 'today',
            'columns' => ['date', 'orders', 'revenue', 'average_cheque'],
        ])
            ->assertOk()
            ->assertJsonCount(1, 'data.rows')
            ->assertJsonPath('data.rows.0.revenue', 1_000_000)
            ->assertJsonPath('data.rows.0.orders', 10)
            // Summed then divided — never the mean of the daily averages.
            ->assertJsonPath('data.rows.0.average_cheque', 100_000)
            ->assertJsonPath('data.totals.revenue', 1_000_000);
    }

    public function test_grouping_by_branch_reads_the_venues_and_names_them(): void
    {
        $this->actingAsOwner();

        $this->fact($this->chilonzor, $this->today, 600_000, 6);
        $this->fact($this->yunusobod, $this->today, 400_000, 4);
        $this->fact(null, $this->today, 1_000_000, 10);

        $answer = $this->postJson('/api/v1/analytics/reports/custom', [
            'base' => 'sales',
            'group_by' => 'branch',
            'period' => 'today',
            'columns' => ['branch', 'revenue'],
        ])->assertOk();

        // Two venues, not three rows: the roll-up is excluded, or the report
        // would show a phantom venue earning the sum of the others.
        $answer->assertJsonCount(2, 'data.rows')
            ->assertJsonPath('data.totals.revenue', 1_000_000);

        $names = array_column($answer->json('data.rows'), 'branch');
        sort($names);
        $this->assertSame(['Chilonzor', 'Yunusobod'], $names);
    }

    public function test_a_percentage_is_computed_after_the_sum_and_is_not_totalled(): void
    {
        $this->actingAsOwner();

        // Two days, very different sizes. The mean of the two daily shares is
        // not the fortnight's share, which is the mistake this asserts against.
        $yesterday = date('Y-m-d', strtotime($this->today.' -1 day'));
        $this->fact(null, $this->today, 1_000_000, 10, labour: 300_000);
        $this->fact(null, $yesterday, 100_000, 1, labour: 50_000);

        $answer = $this->postJson('/api/v1/analytics/reports/custom', [
            'base' => 'staff',
            'group_by' => 'month',
            'period' => 'week',
            'columns' => ['date', 'revenue', 'labour', 'labour_percent'],
        ])->assertOk();

        // 350 000 of 1 100 000 is 32%, not the average of 30% and 50%.
        $answer->assertJsonPath('data.rows.0.labour_percent', 32);
        $this->assertArrayNotHasKey('labour_percent', $answer->json('data.totals'));
    }

    public function test_a_column_that_is_not_on_the_base_is_refused(): void
    {
        $this->actingAsOwner();

        // `labour_percent` is a staff column. The picker could not have
        // produced this, so it is either a stale client or somebody probing.
        $this->postJson('/api/v1/analytics/reports/custom', [
            'base' => 'sales', 'group_by' => 'day', 'columns' => ['labour_percent'],
        ])->assertApiValidationErrors('columns.0');
    }

    public function test_a_column_name_can_never_reach_the_sql(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/analytics/reports/custom', [
            'base' => 'sales',
            'group_by' => 'day',
            'columns' => ['revenue) from analytics.daily_facts; drop table analytics.daily_facts; --'],
        ])->assertApiValidationErrors('columns.0');

        // Still there, which is the assertion the one above cannot make.
        $this->assertSame(0, DailyFact::query()->count());
    }

    public function test_the_builder_exports_the_same_table_as_a_file(): void
    {
        $this->actingAsOwner();
        $this->fact(null, $this->today, 1_000_000, 10);

        $file = $this->postJson('/api/v1/analytics/reports/custom/export', [
            'base' => 'sales', 'group_by' => 'day', 'period' => 'today',
            'columns' => ['date', 'revenue'],
        ])->assertOk()->getContent();

        // Money divided by a hundred on the way out, like every other export
        // this module writes — see CsvReport.
        $this->assertStringContainsString('10000', $file);
        $this->assertStringContainsString('revenue', $file);
    }

    // ============ Schedules ============

    public function test_a_schedule_is_saved_with_its_next_slot(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/analytics/schedules', [
            'kind' => 'cashflow',
            'period' => 'month',
            'frequency' => 'weekly',
            'destinations' => [['channel' => 'mail', 'target' => 'rustam@smartrestaurant.uz']],
        ])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'cashflow')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.last_status', null);

        $schedule = ReportSchedule::query()->firstOrFail();

        // Monday at 08:00, the console's own weekly slot — and in the future,
        // never "now", or creating one at four in the afternoon would fire a
        // report nobody asked for at 16:01.
        $this->assertSame('Monday', $schedule->next_run_at->format('l'));
        $this->assertSame('08:00', $schedule->next_run_at->format('H:i'));
        $this->assertTrue($schedule->next_run_at->isFuture());
    }

    public function test_a_schedule_with_nowhere_to_send_is_refused(): void
    {
        $this->actingAsOwner();

        // A job that builds a month of cashflow every Monday and throws it away.
        $this->postJson('/api/v1/analytics/schedules', [
            'kind' => 'cashflow', 'frequency' => 'weekly', 'destinations' => [],
        ])->assertApiValidationErrors('destinations');
    }

    public function test_a_telegram_destination_has_to_look_like_a_chat(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/analytics/schedules', [
            'kind' => 'cashflow', 'frequency' => 'daily',
            'destinations' => [['channel' => 'telegram', 'target' => 'Rustam Karimov']],
        ])->assertApiValidationErrors('destinations.0.target');
    }

    public function test_a_custom_schedule_carries_a_definition_the_whitelist_accepts(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/analytics/schedules', [
            'kind' => 'custom', 'frequency' => 'monthly',
            'destinations' => [['channel' => 'telegram', 'target' => '-100234567']],
            'definition' => ['base' => 'fin', 'group_by' => 'month', 'columns' => ['date', 'net_profit']],
        ])->assertCreated();

        // And the same definition with a column from another base is not.
        $this->postJson('/api/v1/analytics/schedules', [
            'kind' => 'custom', 'frequency' => 'monthly',
            'destinations' => [['channel' => 'telegram', 'target' => '-100234567']],
            'definition' => ['base' => 'fin', 'group_by' => 'month', 'columns' => ['labour_percent']],
        ])->assertApiValidationErrors('definition.columns.0');
    }

    public function test_the_scheduler_sends_what_is_due_and_moves_it_on(): void
    {
        $this->actingAsOwner();
        $this->fact(null, $this->today, 1_000_000, 10);
        Mail::fake();

        $schedule = ReportSchedule::query()->create([
            'tenant_id' => $this->tenant->id,
            'kind' => 'cashflow',
            'period' => 'today',
            'frequency' => 'daily',
            'destinations' => [['channel' => 'mail', 'target' => 'rustam@smartrestaurant.uz']],
            'is_active' => true,
            'next_run_at' => now()->subMinute(),
        ]);

        $this->artisan('analytics:send-scheduled')->assertSuccessful();

        Mail::assertSentCount(1);

        $schedule->refresh();
        $this->assertSame('sent', $schedule->last_status);
        $this->assertNotNull($schedule->last_run_at);
        // Moved on, so the next tick five minutes later does not send it again.
        $this->assertTrue($schedule->next_run_at->isFuture());
    }

    public function test_a_schedule_that_is_switched_off_is_not_sent(): void
    {
        $this->actingAsOwner();
        Mail::fake();

        $schedule = ReportSchedule::query()->create([
            'tenant_id' => $this->tenant->id,
            'kind' => 'cashflow', 'period' => 'today', 'frequency' => 'daily',
            'destinations' => [['channel' => 'mail', 'target' => 'a@b.uz']],
            'is_active' => true,
            'next_run_at' => now()->subMinute(),
        ]);

        $this->patchJson("/api/v1/analytics/schedules/{$schedule->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->artisan('analytics:send-scheduled')->assertSuccessful();

        Mail::assertNothingSent();
    }

    public function test_a_cashier_may_not_have_the_takings_emailed_weekly(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('cashier');
        $this->actingAs($user);

        // A schedule is an export that repeats itself, so it needs the
        // permission an export needs.
        $this->postJson('/api/v1/analytics/schedules', [
            'kind' => 'cashflow', 'frequency' => 'weekly',
            'destinations' => [['channel' => 'mail', 'target' => 'a@b.uz']],
        ])->assertForbidden();
    }

    public function test_another_restaurants_schedule_is_invisible(): void
    {
        $this->actingAsOwner();

        ReportSchedule::query()->create([
            'tenant_id' => $this->tenant->id,
            'kind' => 'cashflow', 'period' => 'today', 'frequency' => 'daily',
            'destinations' => [['channel' => 'mail', 'target' => 'a@b.uz']],
            'is_active' => true, 'next_run_at' => now()->addDay(),
        ]);

        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('owner');

        $this->actingAs($stranger)
            ->withHeader('X-Tenant', $other->slug)
            ->getJson('/api/v1/analytics/schedules')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
