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
use Modules\Finance\Services\ShiftCloser;
use RuntimeException;
use Tests\TestCase;

/**
 * Which drawer a refund actually comes out of.
 *
 * `refund()` was one line — flip the payment row and return — and that line
 * produced two incorrect Z-reports from one button press. The arithmetic that
 * makes it subtle: `computeExpectedCash()` counts CAPTURED payments only, so
 * reversing a cash payment already takes its money, its tip and its rounding out
 * of the expected drawer. Inside the shift that took it, that is exactly right
 * and nothing else must happen.
 *
 * It goes wrong the moment the refund crosses shifts, and it crossed them
 * silently. Yesterday's shift is closed: the notes come out of today's drawer and
 * today's shift knows nothing about it, so today closes short by the refund.
 * Another till open right now is worse: the other shift loses the payment from
 * its expectation and closes OVER while this one hands out notes it never
 * recorded and closes SHORT.
 */
final class DrawerRefundTest extends TestCase
{
    use RefreshDatabase;

    private const BILL = 30_000_000;   // 300 000 so'm

    private const FLOAT = 20_000_000;  // 200 000 so'm

    private TillLedger $till;

    private EloquentTillLedger $ledger;

    private ShiftCloser $closer;

    private User $cashier;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($tenant);

        $this->cashier = User::factory()->create(['tenant_id' => $tenant->id]);
        $this->other = User::factory()->create(['tenant_id' => $tenant->id]);

        $this->till = app(TillLedger::class);
        $this->ledger = app(EloquentTillLedger::class);
        $this->closer = app(ShiftCloser::class);
    }

    /**
     * The ordinary case, and the one that must NOT write a payout.
     *
     * Reversing the payment already removes it from the expected drawer. Writing
     * a cash expense as well would subtract the money twice and close the till
     * over by exactly the refunded amount — a surplus reported against the person
     * who handed the notes back.
     */
    public function test_a_refund_inside_its_own_shift_moves_the_drawer_exactly_once(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $paymentId = $this->till->capture($shiftId, 1, 'A-0001', new Tender('cash', self::BILL));

        $this->assertSame(self::FLOAT + self::BILL, $this->till->shiftTotals($shiftId)->expectedCash);

        $this->till->refundPayment($paymentId, 'Taom sovuq edi');

        $this->assertSame(self::FLOAT, $this->till->shiftTotals($shiftId)->expectedCash);
        $this->assertSame(0, Expense::query()->where('cash_shift_id', $shiftId)->count());

        // And the drawer agrees at closing without anybody explaining anything.
        $this->assertSame(0, (int) $this->closer->close(
            shift: CashShift::query()->findOrFail($shiftId),
            countedCash: self::FLOAT,
        )->difference);
    }

    /**
     * Two tills open, one guest, one wrong answer.
     *
     * Refused rather than recorded on both sides, because the notes physically
     * leave one drawer and no amount of bookkeeping makes them leave two. The
     * restriction costs a restaurant one walk across the room; the alternative
     * costs it two unexplainable shifts.
     */
    public function test_a_refund_from_another_open_till_is_refused(): void
    {
        $mine = $this->till->openShift($this->cashier->id, self::FLOAT);
        $theirs = $this->till->openShift($this->other->id, self::FLOAT);

        $paymentId = $this->till->capture($theirs, 1, 'A-0001', new Tender('cash', self::BILL));

        try {
            $this->ledger->refundPayment($paymentId, 'Mehmon shikoyat qildi', $mine);
            $this->fail('One till refunded another till\'s payment.');
        } catch (RuntimeException $refusal) {
            $this->assertStringContainsString('o\'sha kassada', $refusal->getMessage());
        }

        // Neither drawer moved.
        $this->assertSame(self::FLOAT, $this->till->shiftTotals($mine)->expectedCash);
        $this->assertSame(self::FLOAT + self::BILL, $this->till->shiftTotals($theirs)->expectedCash);
        $this->assertSame('captured', Payment::query()->findOrFail($paymentId)->status);
    }

    /**
     * Yesterday's bill, today's drawer.
     *
     * The payout lands on the shift that hands the notes over, which is the only
     * shift that is short of them. Last night's Z is a signed document and does
     * not move.
     */
    public function test_a_refund_of_a_closed_shifts_payment_comes_out_of_todays_drawer(): void
    {
        $yesterday = $this->till->openShift($this->cashier->id, self::FLOAT);
        $paymentId = $this->till->capture($yesterday, 1, 'A-0001', new Tender('cash', self::BILL));
        $signed = $this->closer->close(
            shift: CashShift::query()->findOrFail($yesterday),
            countedCash: self::FLOAT + self::BILL,
        );

        $today = $this->till->openShift($this->other->id, self::FLOAT);
        $this->ledger->refundPayment($paymentId, 'Mehmon kecha shikoyat qilgan', $today);

        // Today is down by the bill, and it says why.
        $this->assertSame(self::FLOAT - self::BILL, $this->till->shiftTotals($today)->expectedCash);

        $payout = Expense::query()->where('cash_shift_id', $today)->firstOrFail();
        $this->assertSame('refund', $payout->category);
        $this->assertSame(self::BILL, $payout->amount);
        $this->assertStringContainsString('A-0001', $payout->description);

        // Yesterday's figures are exactly what was signed.
        $reread = $this->till->shiftTotals($yesterday);
        $this->assertSame(self::FLOAT + self::BILL, $reread->expectedCash);
        $this->assertSame(self::BILL, $reread->totalTakings, 'A signed Z-report moved.');
        $this->assertSame(0, $reread->difference);
        $this->assertSame(self::FLOAT + self::BILL, (int) $signed->counted_cash);
    }

    /**
     * A card refund opens no drawer.
     *
     * The acquirer reverses it against an account, days later. Recording a payout
     * for it would take notes out of a till for money that was never in it.
     */
    public function test_a_card_refund_never_touches_the_cash_drawer(): void
    {
        $yesterday = $this->till->openShift($this->cashier->id, self::FLOAT);
        $paymentId = $this->till->capture($yesterday, 1, 'A-0001', new Tender('uzcard', self::BILL, 'RRN-1'));
        $this->closer->close(shift: CashShift::query()->findOrFail($yesterday), countedCash: self::FLOAT);

        $today = $this->till->openShift($this->other->id, self::FLOAT);
        $this->ledger->refundPayment($paymentId, 'Karta bo\'yicha qaytarish', $today);

        $this->assertSame(self::FLOAT, $this->till->shiftTotals($today)->expectedCash);
        $this->assertSame(0, Expense::query()->where('cash_shift_id', $today)->count());
    }

    /**
     * What the caller needs to move the bill with it.
     *
     * A table paying with two cards and asking for one back is a PARTIAL refund
     * and the bill is still a sale. Counted here, inside the transaction that
     * flipped the row, so a second query cannot race it.
     */
    public function test_a_refund_reports_what_is_still_standing_on_the_bill(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $first = $this->till->capture($shiftId, 42, 'A-0042', new Tender('uzcard', 15_000_000, 'RRN-1'));
        $this->till->capture($shiftId, 42, 'A-0042', new Tender('humo', 15_000_000, 'RRN-2'));

        $partial = $this->ledger->refundPayment($first, 'Bitta karta qaytarildi');

        $this->assertSame(42, $partial->orderId);
        $this->assertSame('A-0042', $partial->orderNumber);
        $this->assertSame(1, $partial->liveTenders);
        $this->assertFalse($partial->orderFullyRefunded, 'A half-refunded bill is still a sale.');
        $this->assertSame(0, $partial->cashReturned, 'A card refund returns no notes.');
    }

    public function test_the_last_reversal_marks_the_bill_fully_refunded(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $first = $this->till->capture($shiftId, 42, 'A-0042', new Tender('cash', 15_000_000));
        $second = $this->till->capture($shiftId, 42, 'A-0042', new Tender('humo', 15_000_000, 'RRN-2'));

        $this->ledger->refundPayment($first, 'Birinchi');
        $last = $this->ledger->refundPayment($second, 'Ikkinchi');

        $this->assertSame(0, $last->liveTenders);
        $this->assertTrue($last->orderFullyRefunded);
    }

    public function test_a_payment_cannot_be_refunded_twice(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $paymentId = $this->till->capture($shiftId, 1, 'A-0001', new Tender('cash', self::BILL));

        $this->till->refundPayment($paymentId, 'Birinchi marta');

        // An exception rather than `false`: the rest of this module says no with
        // a sentence, and a caller that got `false` had nothing to show a cashier.
        $this->expectException(RuntimeException::class);
        $this->till->refundPayment($paymentId, 'Ikkinchi marta');
    }

    /**
     * A drawer being counted hands nothing back.
     */
    public function test_a_locked_drawer_refuses_a_refund(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $paymentId = $this->till->capture($shiftId, 1, 'A-0001', new Tender('cash', self::BILL));

        $this->closer->lock(CashShift::query()->findOrFail($shiftId));

        $this->expectException(RuntimeException::class);
        $this->till->refundPayment($paymentId, 'Sanoq vaqtida');
    }
}
