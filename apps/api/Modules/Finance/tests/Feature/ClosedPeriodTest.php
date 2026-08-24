<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\CashCount;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\AccountingPeriod;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Tests\TestCase;

/**
 * Closing a month, and the lock that makes closing it mean anything.
 *
 * Almost every test here is about the LOCK rather than the row. A close endpoint
 * that only writes a status is a button that changes a label — everything
 * possible before it is still possible after — so what is asserted is the
 * refusals: an expense backdated into a signed month, an edit to one already in
 * it, a delete out of it, and the amendment path that was the most tempting
 * exemption to grant.
 */
final class ClosedPeriodTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The clock, pinned.
     *
     * Every figure in this file is about a MONTH — which month is closed, which
     * is still running, which day falls inside one — and "now" decides all of
     * them. Left to the wall clock, this suite passes all day and fails between
     * midnight and 06:00, because the venue's trading day has not turned over
     * yet and `Carbon::now()->subMonth()` and `BusinessDay::dateFor()` stop
     * agreeing about which month it is. A test that only fails at four in the
     * morning is a test nobody trusts.
     *
     * Mid-month and mid-afternoon, so neither the month boundary nor the
     * trading-day boundary is anywhere near it.
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

    /** The month before the one the venue is trading in. */
    private function lastMonth(): string
    {
        return Carbon::now()->subMonthNoOverflow()->format('Y-m');
    }

    private function closeLastMonth(): string
    {
        $month = $this->lastMonth();

        $this->postJson("/api/v1/finance/periods/{$month}/close", ['note' => 'Buxgalter yopdi'])
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');

        return $month;
    }

    // ============ The row ============

    public function test_the_list_shows_months_nobody_has_touched(): void
    {
        $this->actingAsOwner();

        $rows = $this->getJson('/api/v1/finance/periods?months=3')->assertOk()->json('data');

        $this->assertCount(3, $rows);
        $this->assertNull($rows[0]['id']);
        $this->assertSame('open', $rows[0]['status']);
        // Newest first — a ledger screen opens on the month somebody is about to
        // close, not on one from a year ago.
        $this->assertSame(Carbon::now()->format('Y-m'), $rows[0]['period']);
    }

    public function test_a_running_month_cannot_be_closed(): void
    {
        $this->actingAsOwner();

        $month = Carbon::now()->format('Y-m');

        $this->postJson("/api/v1/finance/periods/{$month}/close")
            ->assertStatus(409)
            ->assertApiError('finance.period_still_running');
    }

    public function test_closing_freezes_the_months_figures(): void
    {
        $user = $this->actingAsOwner();
        $when = Carbon::now()->subMonthNoOverflow()->startOfMonth()->addDays(10);

        Payment::factory()->create([
            'amount' => 40_000_000,
            'status' => 'captured',
            'paid_at' => $when,
            'business_date' => $when->toDateString(),
        ]);

        $month = $this->closeLastMonth();

        $period = AccountingPeriod::query()->where('period', $month)->firstOrFail();
        $this->assertSame(40_000_000, $period->revenue_tiyin);
        $this->assertSame($user->id, $period->closed_by_user_id);

        /*
         * And the figure does NOT move when the rows behind it do. A refund
         * landing next week reaches back into the same payments; recomputing on
         * read would quietly change the number somebody signed, and the question
         * six months later — what did I sign — would have no answer.
         */
        Payment::query()->update(['amount' => 1]);

        $this->getJson('/api/v1/finance/periods?months=2')
            ->assertOk()
            ->assertJsonPath('data.1.revenue_tiyin', 40_000_000);
    }

    public function test_a_month_cannot_be_closed_twice(): void
    {
        $this->actingAsOwner();
        $month = $this->closeLastMonth();

        $this->postJson("/api/v1/finance/periods/{$month}/close")
            ->assertStatus(409)
            ->assertApiError('finance.period_already_closed');
    }

    // ============ The lock ============

    public function test_an_expense_cannot_be_backdated_into_a_closed_month(): void
    {
        $this->actingAsOwner();
        $month = $this->closeLastMonth();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'rent',
            'description' => 'Ijara · kechikkan faktura',
            'amount' => 12_000_000,
            'spent_at' => $month.'-15 10:00:00',
        ])->assertStatus(422)->assertApiError('finance.period_closed');

        // The open month still takes it — the lock is about one month, not about
        // whether the ledger is writable at all.
        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'rent',
            'description' => 'Ijara · bu oy',
            'amount' => 12_000_000,
        ])->assertCreated();
    }

    public function test_an_entry_already_inside_a_closed_month_cannot_be_edited_or_removed(): void
    {
        $this->actingAsOwner();

        $when = Carbon::now()->subMonthNoOverflow()->startOfMonth()->addDays(4);

        $id = $this->postJson('/api/v1/finance/expenses', [
            'category' => 'utilities',
            'description' => 'Elektr',
            'amount' => 3_000_000,
            'spent_at' => $when->toDateTimeString(),
        ])->assertCreated()->json('data.id');

        $this->closeLastMonth();

        // Editing a signed month's figure changes the statement as much as
        // adding a row does, and leaves no trace on the period.
        $this->patchJson("/api/v1/finance/expenses/{$id}", ['amount' => 30_000_000])
            ->assertStatus(422)->assertApiError('finance.period_closed');

        // A soft delete is an amount removed from a total.
        $this->deleteJson("/api/v1/finance/expenses/{$id}")
            ->assertStatus(422)->assertApiError('finance.period_closed');
    }

    public function test_amending_a_sealed_shift_is_not_exempt_from_the_lock(): void
    {
        $user = $this->actingAsOwner();

        /*
         * The most tempting exemption on the platform, and it is refused.
         *
         * `amendClosedShift()` is the one door into a sealed SHIFT — an offline
         * sale that reached the server after the Z was taken. A sealed shift is
         * last night; a closed month is a figure that has left the building.
         * When the two collide the amendment belongs in the open month with a
         * note, and a person has to make that choice rather than have the system
         * make it silently.
         */
        $ledger = app(TillLedger::class);
        $when = Carbon::now()->subMonthNoOverflow()->startOfMonth()->addDays(6);

        // Wound back to open and close a shift inside the month that is about
        // to be sealed, then put back — the file's own pinned clock, not the
        // wall clock. See `setUp()`.
        $pinned = Carbon::now();
        Carbon::setTestNow($when);
        $shift = $ledger->openShift($user->id, 0);
        $ledger->closeShift($shift, CashCount::ofTotal(0));
        Carbon::setTestNow($pinned);

        $this->closeLastMonth();

        $this->expectExceptionMessage('The '.$this->lastMonth().' period is closed');

        $ledger->amendClosedShift(
            $shift,
            1,
            'T-9',
            new Tender('cash', 5_000_000),
            'Oflayn navbat kechikdi',
            $user->id,
        );
    }

    public function test_reopening_needs_a_reason_and_lets_the_money_move_again(): void
    {
        $this->actingAsOwner();
        $month = $this->closeLastMonth();

        // Loud on purpose: this is the only act in the module that unmakes a
        // signature, and a reason nobody was made to type is a reason nobody
        // wrote.
        $this->postJson("/api/v1/finance/periods/{$month}/reopen")
            ->assertApiValidationErrors('note');

        $this->postJson("/api/v1/finance/periods/{$month}/reopen", ['note' => 'Faktura kechikdi'])
            ->assertOk()
            ->assertJsonPath('data.status', 'open');

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'rent',
            'description' => 'Ijara · kechikkan faktura',
            'amount' => 12_000_000,
            'spent_at' => $month.'-15 10:00:00',
        ])->assertCreated();
    }

    public function test_reopening_a_month_that_was_never_closed_is_refused(): void
    {
        $this->actingAsOwner();

        $month = $this->lastMonth();

        $this->postJson("/api/v1/finance/periods/{$month}/reopen", ['note' => 'Nega'])
            ->assertStatus(409)
            ->assertApiError('finance.period_not_closed');
    }

    // ============ Permission and tenancy ============

    public function test_a_cashier_may_read_the_months_and_never_close_one(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cashier');
        $this->actingAs($user);

        $this->getJson('/api/v1/finance/periods')->assertOk();

        $month = $this->lastMonth();
        $this->postJson("/api/v1/finance/periods/{$month}/close")->assertStatus(403);
    }

    public function test_one_restaurants_closed_month_does_not_lock_anothers(): void
    {
        $mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $month = $this->lastMonth();
        [$from, $to] = AccountingPeriod::bounds($month);

        AccountingPeriod::query()->create([
            'tenant_id' => $theirs->id,
            'period' => $month,
            'starts_on' => $from,
            'ends_on' => $to,
            'status' => 'closed',
            'closed_at' => now(),
        ]);

        $user = User::factory()->create(['tenant_id' => $mine->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        // Their signature is not ours. A lock that leaked across restaurants
        // would let one accountant freeze another restaurant's books.
        $this->withHeader('X-Tenant', 'osh-markazi')->postJson('/api/v1/finance/expenses', [
            'category' => 'rent',
            'description' => 'Ijara',
            'amount' => 12_000_000,
            'spent_at' => $month.'-15 10:00:00',
        ])->assertCreated();

        $this->assertSame(1, Expense::query()->where('tenant_id', $mine->id)->count());
    }
}
