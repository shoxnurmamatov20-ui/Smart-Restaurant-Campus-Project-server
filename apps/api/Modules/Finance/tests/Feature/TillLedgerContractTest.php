<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Finance\Services\EloquentTillLedger;
use RuntimeException;
use Tests\TestCase;

/**
 * Money, as everything outside Finance is allowed to move it.
 *
 * The POS asks for a payment; this module decides whether it gets one. The
 * tests below pin the promises that make a single answer to "what did we take
 * today" possible — and one in particular: an inkassatsiya mid-shift must not
 * look like a shortfall at closing time, without anybody editing the arithmetic
 * inside `CashShift::close()`.
 */
final class TillLedgerContractTest extends TestCase
{
    use RefreshDatabase;

    private TillLedger $till;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();

        $tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($tenant);

        $this->cashier = User::factory()->create(['tenant_id' => $tenant->id]);
        $this->till = app(TillLedger::class);
    }

    // ============ The contract is wired up ============

    public function test_the_platform_resolves_finances_own_implementation(): void
    {
        $this->assertInstanceOf(
            EloquentTillLedger::class,
            app(TillLedger::class),
        );
    }

    // ============ Shifts ============

    public function test_opening_a_shift_records_the_float(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 50_000_000);

        $shift = CashShift::query()->findOrFail($shiftId);
        $this->assertSame('open', $shift->status);
        $this->assertSame(50_000_000, $shift->opening_cash);
        $this->assertSame($shiftId, $this->till->openShiftFor($this->cashier->id));
    }

    public function test_a_cashier_cannot_have_two_open_shifts(): void
    {
        $this->till->openShift($this->cashier->id, 0);

        // Two drawers open for one person means every payment after the second
        // one lands in an arbitrary till.
        $this->expectException(RuntimeException::class);
        $this->till->openShift($this->cashier->id, 0);
    }

    public function test_a_negative_float_is_refused(): void
    {
        $this->expectException(RuntimeException::class);
        $this->till->openShift($this->cashier->id, -1);
    }

    // ============ Taking money ============

    public function test_capturing_a_tender_writes_one_payment(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);

        $paymentId = $this->till->capture($shiftId, 42, 'A-0042', new Tender('cash', 12_000_000));

        $payment = Payment::query()->findOrFail($paymentId);
        $this->assertSame('captured', $payment->status);
        $this->assertSame(12_000_000, $payment->amount);
        $this->assertSame('A-0042', $payment->order_number);
        $this->assertSame($shiftId, (int) $payment->cash_shift_id);
    }

    public function test_a_mixed_payment_is_several_tenders_on_one_bill(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);

        $this->till->capture($shiftId, 42, 'A-0042', new Tender('cash', 5_000_000));
        $this->till->capture($shiftId, 42, 'A-0042', new Tender('card', 7_000_000));

        $totals = $this->till->shiftTotals($shiftId);
        $this->assertSame(12_000_000, $totals->totalTakings);
        // Keyed by method, not ordered by it — the grouping comes back in
        // whatever order PostgreSQL hands it over.
        $this->assertSame(5_000_000, $totals->byMethod['cash']);
        $this->assertSame(7_000_000, $totals->byMethod['card']);
        $this->assertSame(2, $totals->paymentCount);
    }

    public function test_an_unknown_payment_method_is_refused(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);

        $this->expectException(RuntimeException::class);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('bitcoin', 1_000));
    }

    public function test_a_zero_tender_is_refused(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);

        $this->expectException(RuntimeException::class);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 0));
    }

    public function test_a_closed_shift_takes_no_more_money(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);
        $this->till->closeShift($shiftId, 0);

        $this->expectException(RuntimeException::class);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 1_000));
    }

    public function test_a_refund_reverses_without_erasing(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);
        $paymentId = $this->till->capture($shiftId, 42, 'A-0042', new Tender('cash', 12_000_000));

        $this->assertTrue($this->till->refund($paymentId, 'Taom sovuq edi'));

        $payment = Payment::query()->findOrFail($paymentId);
        $this->assertSame('refunded', $payment->status);
        $this->assertSame('Taom sovuq edi', $payment->refund_reason);

        $totals = $this->till->shiftTotals($shiftId);
        $this->assertSame(0, $totals->totalTakings);
        $this->assertSame(12_000_000, $totals->refunded);
    }

    // ============ Cash leaving the drawer ============

    public function test_a_collection_is_recorded_as_cash_leaving_the_drawer(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);

        $expenseId = $this->till->recordCashOut($shiftId, 30_000_000, 'Inkassatsiya #1');

        $expense = Expense::query()->findOrFail($expenseId);
        $this->assertTrue($expense->paid_in_cash);
        $this->assertSame(30_000_000, $expense->amount);
        $this->assertSame($shiftId, (int) $expense->cash_shift_id);
    }

    /**
     * The reason the whole design works without touching CashShift::close().
     */
    public function test_a_collection_does_not_show_up_as_a_shortfall(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 10_000_000);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 100_000_000));

        // The manager takes 80 so'm out of the drawer mid-shift…
        $this->till->recordCashOut($shiftId, 80_000_000, 'Inkassatsiya');

        // …so 30 is what should physically be there at closing.
        $totals = $this->till->closeShift($shiftId, 30_000_000);

        $this->assertSame(30_000_000, $totals->expectedCash);
        $this->assertSame(30_000_000, $totals->countedCash);
        $this->assertSame(0, $totals->difference, 'A collection must not read as a short till.');
    }

    public function test_a_short_drawer_is_reported_as_negative(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 10_000_000);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 40_000_000));

        $totals = $this->till->closeShift($shiftId, 45_000_000);

        $this->assertSame(50_000_000, $totals->expectedCash);
        $this->assertSame(-5_000_000, $totals->difference);
    }

    // ============ X and Z ============

    public function test_the_x_report_does_not_close_the_shift(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 10_000_000);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 40_000_000));

        $x = $this->till->shiftTotals($shiftId);

        $this->assertSame('open', $x->status);
        $this->assertNull($x->countedCash);
        $this->assertNull($x->difference);
        // Same formula as the close, so an X-report can never disagree with a Z.
        $this->assertSame(50_000_000, $x->expectedCash);
        $this->assertSame('open', CashShift::query()->findOrFail($shiftId)->status);
    }

    public function test_a_shift_closes_only_once(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);
        $this->till->closeShift($shiftId, 0);

        $this->expectException(RuntimeException::class);
        $this->till->closeShift($shiftId, 0);
    }

    public function test_the_caller_can_never_state_the_expected_cash(): void
    {
        // There is simply no parameter for it — the count is the only number a
        // client contributes, which is the entire point of counting.
        $reflection = new \ReflectionMethod(TillLedger::class, 'closeShift');
        $parameters = array_map(
            static fn (\ReflectionParameter $p): string => $p->getName(),
            $reflection->getParameters(),
        );

        $this->assertSame(['shiftId', 'countedCash', 'note'], $parameters);
    }

    public function test_the_methods_list_comes_from_finance(): void
    {
        $this->assertSame(Payment::METHODS, $this->till->methods());
    }
}
