<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\CashCount;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Errors\ApiException;
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
        $this->till->closeShift($shiftId, CashCount::ofTotal(0));

        $this->expectException(RuntimeException::class);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 1_000));
    }

    public function test_a_refund_reverses_without_erasing(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 0);
        $paymentId = $this->till->capture($shiftId, 42, 'A-0042', new Tender('cash', 12_000_000));

        // `refundPayment` answers what it did rather than a bare true: Orders has to
        // know which bill the money came off and whether anything is still standing
        // on it. See RefundResult.
        $refund = $this->till->refundPayment($paymentId, 'Taom sovuq edi');

        $this->assertSame($paymentId, $refund->paymentId);

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
        $totals = $this->till->closeShift($shiftId, CashCount::ofTotal(30_000_000));

        $this->assertSame(30_000_000, $totals->expectedCash);
        $this->assertSame(30_000_000, $totals->countedCash);
        $this->assertSame(0, $totals->difference, 'A collection must not read as a short till.');
    }

    /**
     * A gap of 1 000 so'm, explained.
     *
     * Small on purpose: past 20 000 so'm the closing ladder wants a manager, and
     * this test is about the sign of the difference rather than about who signs
     * for it — that is DayCloseLadderTest's job. The note carries the
     * explanation, which is what the contract can say today; see
     * `EloquentTillLedger::closeShift()`.
     */
    public function test_a_short_drawer_is_reported_as_negative(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 10_000_000);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 40_000_000));

        /*
         * The reason goes in `varianceReason`, not in `note`.
         *
         * They are two different fields now that the contract carries both, and
         * only one of them satisfies the ladder: `note` is free text about the
         * shift, `varianceReason` is why the drawer did not agree. A close that
         * put the explanation in the note would be refused — which is what the
         * caller wants, because a report has to be able to list every till that
         * came up short without an explanation, and it cannot do that by reading
         * prose.
         */
        $totals = $this->till->closeShift(
            $shiftId,
            CashCount::ofTotal(49_900_000),
            varianceReason: 'Mehmonga ortiqcha qaytim berilgan',
        );

        $this->assertSame(50_000_000, $totals->expectedCash);

        // The point of the test, and it survives the explanation: short is
        // negative. An unsigned column here would have turned every shortfall
        // into a surplus and balanced the books while the drawer did not.
        $this->assertSame(-100_000, $totals->difference);
    }

    /**
     * And an unexplained one does not close at all.
     *
     * The rule the plan states as "a difference that is not zero does not close",
     * read the only way that works in a restaurant: it does not close SILENTLY.
     * Without this the count produces a number nobody has to account for, which
     * is the same as not counting.
     */
    public function test_a_drawer_that_does_not_agree_will_not_close_without_a_reason(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, 10_000_000);
        $this->till->capture($shiftId, 1, 'A-1', new Tender('cash', 40_000_000));

        $this->expectException(ApiException::class);
        $this->till->closeShift($shiftId, CashCount::ofTotal(49_900_000));
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
        $this->till->closeShift($shiftId, CashCount::ofTotal(0));

        $this->expectException(RuntimeException::class);
        $this->till->closeShift($shiftId, CashCount::ofTotal(0));
    }

    public function test_the_caller_can_never_state_the_expected_cash(): void
    {
        /*
         * Asserted as an ABSENCE rather than an exact list.
         *
         * The list form broke the moment the closing ladder arrived — `note`,
         * `varianceReason`, `approvedByUserId`, `closedByUserId` are all things a
         * client legitimately supplies — and a test that fails whenever the
         * signature grows teaches the next person to update it without reading it.
         * What must never appear is a way to state the expected figure: the whole
         * point of counting a drawer is comparing it against a number the system
         * derived, and a caller that could send both could make the difference zero.
         */
        $reflection = new \ReflectionMethod(TillLedger::class, 'closeShift');
        $parameters = array_map(
            static fn (\ReflectionParameter $p): string => $p->getName(),
            $reflection->getParameters(),
        );

        foreach ($parameters as $name) {
            $this->assertStringNotContainsStringIgnoringCase(
                'expected',
                $name,
                "closeShift() must never let a caller state the expected cash — saw '{$name}'",
            );
        }

        // And the count itself is a value object, not a bare integer: "45 000 000
        // tiyin" and "nine 50 000 notes" are different claims and only the second
        // can be checked against itself.
        $this->assertSame('count', $parameters[1]);
        $this->assertSame(
            CashCount::class,
            (string) $reflection->getParameters()[1]->getType(),
        );
    }

    public function test_the_methods_list_comes_from_finance(): void
    {
        $this->assertSame(Payment::METHODS, $this->till->methods());
    }
}
