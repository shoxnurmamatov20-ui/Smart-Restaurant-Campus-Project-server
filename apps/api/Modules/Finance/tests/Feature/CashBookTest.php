<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\CashAccount;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\FixedAsset;
use Modules\Finance\Models\Payment;
use Tests\TestCase;

/**
 * The ledger screen's two tables: the cash book and the asset register.
 *
 * Both existed as drawings with nothing behind them. The book could not be read
 * through one door — three tables, no date range on any of them — and a transfer
 * could only be written as one leg, which is why a night that made money could
 * show a loss.
 */
final class CashBookTest extends TestCase
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

    private function today(): string
    {
        return Carbon::now()->toDateString();
    }

    // ============ Reading ============

    public function test_the_book_puts_three_tables_in_one_list_with_a_running_balance(): void
    {
        $this->actingAsOwner();

        CashAccount::query()->create([
            'code' => 'safe', 'name' => ['uz' => 'Seyf'], 'kind' => 'safe',
            'opening_balance' => 10_000_000,
        ]);

        $shift = $this->postJson('/api/v1/finance/shifts/open', ['opening_cash' => 0])
            ->assertCreated()->json('data.id');

        Payment::factory()->create([
            'cash_shift_id' => $shift,
            'method' => 'cash',
            'amount' => 30_000_000,
            'status' => 'captured',
            'paid_at' => now(),
        ]);

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'purchase', 'description' => 'Ko\'katlar', 'amount' => 4_000_000,
            'paid_in_cash' => true,
        ])->assertCreated();

        CashMovement::query()->create([
            'cash_shift_id' => $shift,
            'direction' => 'in',
            'amount' => 5_000_000,
            'reason' => 'Mayda pul, seyfdan',
            'occurred_at' => now(),
        ]);

        $book = $this->getJson('/api/v1/finance/cash-book?from='.$this->today().'&to='.$this->today())
            ->assertOk()->json();

        $this->assertCount(3, $book['entries']);

        // 10 000 000 in the safe before anything happened today.
        $this->assertSame(10_000_000, $book['opening_balance']);
        // + 30 000 000 taken − 4 000 000 spent + 5 000 000 brought.
        $this->assertSame(41_000_000, $book['closing_balance']);
        $this->assertSame(35_000_000, $book['totals']['in']);
        $this->assertSame(4_000_000, $book['totals']['out']);

        // The last row's balance IS the closing figure — a ledger whose running
        // column disagrees with its own footer is a ledger nobody trusts twice.
        $this->assertSame($book['closing_balance'], end($book['entries'])['balance']);
    }

    public function test_a_card_sale_is_in_the_book_and_not_in_the_drawer(): void
    {
        $this->actingAsOwner();

        $shift = $this->postJson('/api/v1/finance/shifts/open', ['opening_cash' => 0])
            ->assertCreated()->json('data.id');

        Payment::factory()->create([
            'cash_shift_id' => $shift, 'method' => 'visa', 'amount' => 20_000_000,
            'status' => 'captured', 'paid_at' => now(),
        ]);

        $entries = $this->getJson('/api/v1/finance/cash-book?from='.$this->today().'&to='.$this->today())
            ->assertOk()->json('entries');

        // The business's book, not the till's: an owner asking what came in on
        // Tuesday means all of it. `affects_drawer` is what keeps the two
        // questions apart.
        $this->assertCount(1, $entries);
        $this->assertFalse($entries[0]['affects_drawer']);
    }

    public function test_a_window_wider_than_a_quarter_is_refused(): void
    {
        $this->actingAsOwner();

        $from = Carbon::now()->subYear()->toDateString();

        $this->getJson("/api/v1/finance/cash-book?from={$from}&to=".$this->today())
            ->assertStatus(422)
            ->assertApiError('finance.window_too_wide');
    }

    // ============ Writing ============

    public function test_a_transfer_is_two_rows_that_point_at_each_other(): void
    {
        $this->actingAsOwner();

        $safe = CashAccount::query()->create([
            'code' => 'safe', 'name' => ['uz' => 'Seyf'], 'kind' => 'safe',
        ]);
        $bank = CashAccount::query()->create([
            'code' => 'bank', 'name' => ['uz' => 'Bank'], 'kind' => 'bank',
        ]);

        $answer = $this->postJson('/api/v1/finance/cash-book/transfers', [
            'from_account_id' => $safe->id,
            'to_account_id' => $bank->id,
            'amount' => 25_000_000,
            'reason' => 'Bankka topshirildi',
        ])->assertOk()->json('data');

        $out = CashMovement::query()->findOrFail($answer['out']['id']);
        $in = CashMovement::query()->findOrFail($answer['in']['id']);

        $this->assertSame($in->id, $out->counterpart_id);
        $this->assertSame($out->id, $in->counterpart_id);
        $this->assertSame('out', $out->direction);
        $this->assertSame('in', $in->direction);

        /*
         * And the pair nets to zero. The single-legged version of this write is
         * the defect the endpoint replaced: money leaving the till for the safe
         * read as money gone, so a profitable night showed a loss.
         */
        $book = $this->getJson('/api/v1/finance/cash-book?from='.$this->today().'&to='.$this->today())
            ->assertOk()->json();

        $this->assertSame(0, $book['closing_balance'] - $book['opening_balance']);
        $this->assertTrue($book['entries'][0]['transfer']);
    }

    public function test_a_transfer_with_only_one_end_is_refused(): void
    {
        $this->actingAsOwner();

        $safe = CashAccount::query()->create([
            'code' => 'safe', 'name' => ['uz' => 'Seyf'], 'kind' => 'safe',
        ]);

        $this->postJson('/api/v1/finance/cash-book/transfers', [
            'from_account_id' => $safe->id,
            'amount' => 1_000_000,
            'reason' => 'Qayerga?',
        ])->assertApiValidationErrors(['to_shift_id', 'to_account_id']);

        $this->postJson('/api/v1/finance/cash-book/transfers', [
            'from_account_id' => $safe->id,
            'to_account_id' => $safe->id,
            'amount' => 1_000_000,
            'reason' => 'O\'ziga',
        ])->assertStatus(422)->assertApiError('finance.transfer_same_place');
    }

    public function test_a_cashier_may_read_the_book_and_never_move_money_between_accounts(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cashier');
        $this->actingAs($user);

        $this->getJson('/api/v1/finance/cash-book')->assertOk();

        $this->postJson('/api/v1/finance/cash-book/transfers', [
            'from_account_id' => 1, 'to_account_id' => 2, 'amount' => 1, 'reason' => 'x',
        ])->assertStatus(403);
    }

    // ============ The register ============

    public function test_an_oven_is_written_down_over_its_life_rather_than_in_one_month(): void
    {
        $this->actingAsOwner();

        // Bought two years and one month ago, on a seven-year life: 7 000 000
        // so'm over 84 months is 8 333 333 tiyin a month, with a remainder the
        // final instalment takes.
        $bought = Carbon::now()->subMonthsNoOverflow(25)->startOfMonth()->addDays(9);

        $asset = $this->postJson('/api/v1/finance/fixed-assets', [
            'name' => 'Kombi pech',
            'category' => 'equipment',
            'acquired_on' => $bought->toDateString(),
            'cost' => 700_000_000,
            'useful_life_months' => 84,
        ])->assertCreated()->json('data');

        $this->assertSame(8_333_333, $asset['monthly_charge']);

        $rows = $this->getJson('/api/v1/finance/fixed-assets')->assertOk()->json();

        // Twenty-five months elapsed, and the month of purchase is not charged.
        $this->assertSame(8_333_333 * 25, $rows['data'][0]['accumulated']);
        $this->assertSame(700_000_000 - 8_333_333 * 25, $rows['data'][0]['book_value']);
        $this->assertSame(8_333_333, $rows['meta']['monthly_charge']);
    }

    public function test_nothing_is_charged_in_the_month_of_purchase_or_after_a_disposal(): void
    {
        $this->actingAsOwner();

        $month = Carbon::now()->format('Y-m');

        $this->postJson('/api/v1/finance/fixed-assets', [
            'name' => 'Bugun olingan muzlatgich',
            'category' => 'equipment',
            'acquired_on' => Carbon::now()->toDateString(),
            'cost' => 120_000_000,
            'useful_life_months' => 60,
        ])->assertCreated();

        $rows = $this->getJson("/api/v1/finance/fixed-assets?month={$month}")->assertOk()->json();

        // An oven bought on the 28th did not cost a month of use.
        $this->assertSame(0, $rows['data'][0]['accumulated']);
        $this->assertSame(0, $rows['meta']['monthly_charge']);

        // And a disposal stops the clock: a fryer sold in March depreciates
        // through February and not one month further.
        $sold = FixedAsset::query()->create([
            'name' => 'Sotilgan fritür',
            'category' => 'equipment',
            'acquired_on' => Carbon::now()->subMonthsNoOverflow(10)->toDateString(),
            'cost' => 60_000_000,
            'useful_life_months' => 60,
            'disposed_on' => Carbon::now()->subMonthsNoOverflow(2)->toDateString(),
        ]);

        $this->assertSame(
            1_000_000 * 7,
            $this->getJson("/api/v1/finance/fixed-assets/{$sold->id}?month={$month}")
                ->assertOk()->json('data.accumulated'),
        );
    }

    public function test_an_asset_cannot_be_worth_more_at_the_end_than_it_cost(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/fixed-assets', [
            'name' => 'Avtomobil',
            'category' => 'vehicle',
            'acquired_on' => Carbon::now()->toDateString(),
            'cost' => 100_000_000,
            'residual' => 100_000_000,
            'useful_life_months' => 84,
        ])->assertApiValidationErrors('residual');
    }
}
