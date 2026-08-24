<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Tests\TestCase;

/**
 * Reading a MONTH out of the ledger, and the three figures a finance screen
 * prints above the tables.
 *
 * The console's finance page drew an em dash where its refunds total and its
 * unreconciled count belong, and the reason was not a missing screen: neither
 * `GET /finance/payments` nor `GET /finance/shifts` could be windowed at all,
 * so there was no month to total. A KPI summed from the first twenty-five rows
 * of a page is the version of this that is worse than a dash.
 *
 * The expense half is the third gap on that screen: `finance.expenses` had one
 * date and the design's table draws a paid/unpaid chip, so the chip was a fact
 * on live rows and a control only on the fixture.
 */
final class FinanceWindowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Pinned mid-month and mid-afternoon.
     *
     * Every assertion here is about which month a row landed in, and the
     * trading day turns over at 06:00 — so a suite left on the wall clock
     * passes all day and fails at four in the morning, when `business_date` and
     * the calendar stop agreeing.
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

    // ============ Payments: the month, and what it was refunded ============

    public function test_payments_can_be_windowed_on_the_trading_day(): void
    {
        $this->actingAsOwner();

        Payment::factory()->create([
            'amount' => 10_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-07-15 13:00:00'),
        ]);
        Payment::factory()->create([
            'amount' => 25_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-03 13:00:00'),
        ]);

        $july = $this->getJson('/api/v1/finance/payments?filter[from]=2026-07-01&filter[to]=2026-07-31')
            ->assertOk()->json();

        $this->assertCount(1, $july['data']);
        $this->assertSame(10_000_000, $july['meta']['captured_tiyin']);
    }

    public function test_the_window_totals_describe_the_whole_month_not_the_page(): void
    {
        $this->actingAsOwner();

        // Three pages' worth at the console's own page size, so a total summed
        // from the rows that came back would be visibly short.
        Payment::factory()->count(30)->create([
            'amount' => 1_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-05 13:00:00'),
        ]);

        $answer = $this->getJson('/api/v1/finance/payments?per_page=10&filter[from]=2026-08-01&filter[to]=2026-08-31')
            ->assertOk()->json();

        $this->assertCount(10, $answer['data']);
        $this->assertSame(30_000_000, $answer['meta']['captured_tiyin']);
    }

    public function test_a_refunded_payment_keeps_its_status_and_is_counted_as_reversed(): void
    {
        $this->actingAsOwner();

        Payment::factory()->create([
            'amount' => 8_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-04 13:00:00'),
        ]);
        Payment::factory()->create([
            'amount' => 3_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-06 13:00:00'),
            'refunded_at' => Carbon::parse('2026-08-07 10:00:00'),
        ]);

        $answer = $this->getJson('/api/v1/finance/payments?filter[from]=2026-08-01&filter[to]=2026-08-31')
            ->assertOk()->json();

        // The money was taken, so it is still in the takings; what changed is
        // that some of it went back.
        $this->assertSame(11_000_000, $answer['meta']['captured_tiyin']);
        $this->assertSame(3_000_000, $answer['meta']['refunded_tiyin']);
        $this->assertSame(1, $answer['meta']['refunded_count']);

        $reversed = $this->getJson('/api/v1/finance/payments?filter[refunded]=1')->assertOk()->json();

        $this->assertCount(1, $reversed['data']);
    }

    // ============ Shifts: which drawers did not agree ============

    public function test_shifts_can_be_windowed_and_counted_by_their_difference(): void
    {
        $this->actingAsOwner();

        CashShift::query()->create([
            'number' => 'Z-0001', 'opened_at' => Carbon::parse('2026-07-10 09:00:00'),
            'closed_at' => Carbon::parse('2026-07-10 23:00:00'), 'status' => 'closed',
            'opening_cash' => 0, 'expected_cash' => 5_000_000, 'counted_cash' => 5_000_000,
            'difference' => 0,
        ]);
        CashShift::query()->create([
            'number' => 'Z-0002', 'opened_at' => Carbon::parse('2026-08-10 09:00:00'),
            'closed_at' => Carbon::parse('2026-08-10 23:00:00'), 'status' => 'closed',
            'opening_cash' => 0, 'expected_cash' => 5_000_000, 'counted_cash' => 4_800_000,
            'difference' => -200_000,
        ]);
        // Still running, and short on paper only because nobody has counted it.
        CashShift::query()->create([
            'number' => 'Z-0003', 'opened_at' => Carbon::parse('2026-08-20 09:00:00'),
            'status' => 'open', 'opening_cash' => 0, 'expected_cash' => 1_000_000,
            'counted_cash' => 0, 'difference' => 0,
        ]);

        $august = $this->getJson('/api/v1/finance/shifts?filter[from]=2026-08-01&filter[to]=2026-08-31')
            ->assertOk()->json();

        $this->assertCount(2, $august['data']);
        $this->assertSame(1, $august['meta']['closed_count']);
        $this->assertSame(1, $august['meta']['unreconciled_count']);
        $this->assertSame(-200_000, $august['meta']['difference_tiyin']);
    }

    public function test_the_last_day_of_the_window_is_inside_it(): void
    {
        $this->actingAsOwner();

        // Opened in the evening of the last day of the month. A bare-date
        // comparison against a timestamp drops this row, which is how a month
        // loses its busiest Saturday.
        CashShift::query()->create([
            'number' => 'Z-0009', 'opened_at' => Carbon::parse('2026-07-31 19:30:00'),
            'closed_at' => Carbon::parse('2026-08-01 02:00:00'), 'status' => 'closed',
            'opening_cash' => 0, 'expected_cash' => 0, 'counted_cash' => 0, 'difference' => 0,
        ]);

        $this->getJson('/api/v1/finance/shifts?filter[from]=2026-07-01&filter[to]=2026-07-31')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_only_a_closed_till_can_be_unreconciled(): void
    {
        $this->actingAsOwner();

        CashShift::query()->create([
            'number' => 'Z-0010', 'opened_at' => Carbon::parse('2026-08-19 09:00:00'),
            'status' => 'open', 'opening_cash' => 0, 'expected_cash' => 900_000,
            'counted_cash' => 0, 'difference' => -900_000,
        ]);

        $this->getJson('/api/v1/finance/shifts?filter[unreconciled]=1')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    // ============ Expenses: filed, and then paid ============

    public function test_a_drawer_payout_is_paid_the_moment_it_is_recorded(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'purchase', 'description' => "Ko'katlar", 'amount' => 400_000,
            'paid_in_cash' => true,
        ])->assertCreated()->assertJsonPath('data.is_paid', true);
    }

    public function test_an_invoice_filed_on_the_books_screen_starts_unpaid(): void
    {
        $this->actingAsOwner();

        $filed = $this->postJson('/api/v1/finance/expenses', [
            'category' => 'rent', 'description' => 'Avgust ijara', 'amount' => 12_000_000,
            'paid_in_cash' => false,
        ])->assertCreated();

        $filed->assertJsonPath('data.is_paid', false);
        $id = $filed->json('data.id');

        $this->getJson('/api/v1/finance/expenses?filter[unpaid]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.unpaid_tiyin', 12_000_000)
            ->assertJsonPath('meta.unpaid_count', 1);

        $this->patchJson("/api/v1/finance/expenses/{$id}", ['paid_at' => '2026-08-20T12:00:00+05:00'])
            ->assertOk()
            ->assertJsonPath('data.is_paid', true);

        // And back again: a chip that only closes is a mis-click somebody has
        // to live with for ever.
        $this->patchJson("/api/v1/finance/expenses/{$id}", ['paid_at' => null])
            ->assertOk()
            ->assertJsonPath('data.is_paid', false);
    }

    public function test_the_expense_window_totals_are_over_the_filter_not_the_page(): void
    {
        $this->actingAsOwner();

        Expense::query()->create([
            'category' => 'rent', 'description' => 'Iyul ijara', 'amount' => 9_000_000,
            'paid_in_cash' => false, 'spent_at' => Carbon::parse('2026-07-02 10:00:00'),
        ]);
        Expense::query()->create([
            'category' => 'rent', 'description' => 'Avgust ijara', 'amount' => 12_000_000,
            'paid_in_cash' => false, 'spent_at' => Carbon::parse('2026-08-02 10:00:00'),
        ]);

        $this->getJson('/api/v1/finance/expenses?filter[from]=2026-08-01&filter[to]=2026-08-31')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total_tiyin', 12_000_000);
    }

    // ============ Permission and tenancy ============

    public function test_a_waiter_cannot_read_the_months_takings(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/finance/payments?filter[from]=2026-08-01&filter[to]=2026-08-31')
            ->assertForbidden();
    }

    public function test_the_window_totals_stop_at_the_restaurants_own_ledger(): void
    {
        $mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Payment::factory()->create([
            'tenant_id' => $mine->id, 'amount' => 4_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-05 13:00:00'),
        ]);
        Payment::factory()->create([
            'tenant_id' => $theirs->id, 'amount' => 90_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-05 13:00:00'),
        ]);

        $user = User::factory()->create(['tenant_id' => $mine->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        // The total is the dangerous half: a leaked ROW is visible and a leaked
        // SUM is a number nobody can attribute.
        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/finance/payments?filter[from]=2026-08-01&filter[to]=2026-08-31')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.captured_tiyin', 4_000_000);
    }
}
