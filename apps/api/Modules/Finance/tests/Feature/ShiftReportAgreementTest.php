<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\CashCount;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Finance\CashRounding;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Finance\Models\CashShift;
use Tests\TestCase;

/**
 * The X-report and the Z-report must name the same expected cash.
 *
 * A cashier reads the X mid-shift to know what should be in the drawer, and the Z
 * decides at closing whether it was. Both figures come out of
 * `CashShift::computeExpectedCash()` — the X because the shift is still open and
 * has nothing stored yet, the Z because `close()` derived and wrote it from the
 * same method. That is the property protected here, and it is protected because it
 * was once false: the formula was written twice, in `close()` and again in
 * `EloquentTillLedger::totalsFor()` under a comment claiming there was only one
 * copy. The two agreed while both were `float + cash − payouts`, then tips and cash
 * rounding entered one of them and not the other.
 *
 * What a restaurant sees when this breaks is the worst failure this module has. The
 * cashier counts the drawer against the figure the terminal showed her all evening,
 * the Z-report names a different one, and the gap — a few thousand so'm of rounding
 * and a tip left in notes — is written down as a shortfall against the person who
 * counted. Nobody can reconstruct it from the receipts, so it becomes distrust.
 *
 * The mix below is deliberately awkward: every term that once diverged is present
 * and non-zero, and two of them (a card tip, card takings) belong in the bank
 * rather than the box, so a formula that swept up all tips or all takings would
 * report a surplus rather than agreement.
 */
final class ShiftReportAgreementTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every figure below is integer tiyin. 1 so'm = 100 tiyin.
     *
     * The two cash bills are the amounts that go on the payment ROW, which is
     * what was owed before rounding — `TenderService` records `cashRevenue` and
     * carries the rounding beside it. The guest hands over the rounded figure, so
     * the drawer receives `amount + rounding`, and that is why expected cash adds
     * both terms rather than double-counting one of them.
     *
     * The rounding is derived from CashRounding rather than written down, and
     * this test used to write it down: it carried a bill "rounded down by 600
     * so'm", which rounding to the nearest 1 000 cannot produce — past 500 it
     * rounds up. So the fixture described an evening that could not happen, and a
     * fixture that cannot happen protects an arithmetic nobody will ever run.
     */
    private const FLOAT = 20_000_000;           // 200 000 so'm counted in at open

    private const BILL_ROUNDING_UP = 46_470_000;   // 464 700 so'm — rounds UP to 465 000

    private const BILL_ROUNDING_DOWN = 31_240_000; // 312 400 so'm — rounds DOWN to 312 000

    private const CASH_TIP = 1_500_000;         // 15 000 so'm left in notes: in the drawer

    private const CARD_TAKINGS = 88_000_000;    // 880 000 so'm on Uzcard: never in the drawer

    private const CARD_TIP = 5_000_000;         // 50 000 so'm tipped on the card: in the bank

    private const COLLECTION = 50_000_000;      // 500 000 so'm taken to the safe mid-shift

    /** Float + cash bills + signed rounding + the CASH tip − the collection. */
    private const EXPECTED_CASH = 49_200_000;

    /** +30 000 tiyin: 300 so'm the guest handed over and the restaurant keeps. */
    private static function roundingUp(): int
    {
        return CashRounding::difference(self::BILL_ROUNDING_UP);
    }

    /** −40 000 tiyin: 400 so'm the guest never handed over. */
    private static function roundingDown(): int
    {
        return CashRounding::difference(self::BILL_ROUNDING_DOWN);
    }

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

    /**
     * An evening with one of everything that has ever confused this arithmetic.
     *
     * @return int The open shift's id.
     */
    private function anAwkwardEvening(): int
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);

        // Cash, rounded up to the terminal's step, with the tip left in notes on
        // the same bill — the two drawer movements that used to be counted in one
        // report and not the other.
        $this->till->capture(
            $shiftId,
            101,
            'A-0101',
            new Tender('cash', self::BILL_ROUNDING_UP, null, self::CASH_TIP),
            self::roundingUp(),
        );

        // Cash, rounded the other way. Rounding is signed for exactly this case:
        // a night of round-downs takes notes out of the drawer, and a report that
        // only ever added rounding would show the till short every evening.
        $this->till->capture(
            $shiftId,
            102,
            'A-0102',
            new Tender('cash', self::BILL_ROUNDING_DOWN),
            self::roundingDown(),
        );

        $this->till->capture(
            $shiftId,
            103,
            'A-0103',
            new Tender('uzcard', self::CARD_TAKINGS, 'RRN-77341', self::CARD_TIP),
        );

        $this->till->recordCashOut($shiftId, self::COLLECTION, 'Inkassatsiya #1');

        return $shiftId;
    }

    public function test_the_x_report_and_the_z_report_name_the_same_expected_cash(): void
    {
        $shiftId = $this->anAwkwardEvening();

        $x = $this->till->shiftTotals($shiftId);
        $z = $this->till->closeShift($shiftId, CashCount::ofTotal($x->expectedCash));

        $this->assertSame(
            $x->expectedCash,
            $z->expectedCash,
            'The figure a cashier read mid-shift is the figure she is held to at closing.',
        );

        // And the stored column agrees with both, read back from the database
        // rather than from the model that wrote it: the Z-report a manager opens
        // tomorrow morning comes from this row, not from a live calculation.
        $this->assertSame(
            $x->expectedCash,
            (int) CashShift::query()->findOrFail($shiftId)->expected_cash,
        );

        // A cashier who counted exactly what the X-report told her is not short.
        $this->assertSame(0, $z->difference);
    }

    /**
     * The one assertion that survives both copies of the formula being wrong
     * together: the sum is spelled out here from the inputs, not borrowed from the
     * code under test.
     */
    public function test_expected_cash_is_the_float_plus_cash_bills_plus_rounding_plus_cash_tips_minus_payouts(): void
    {
        $byHand = self::FLOAT
            + self::BILL_ROUNDING_UP
            + self::BILL_ROUNDING_DOWN
            + self::roundingUp()
            + self::roundingDown()
            + self::CASH_TIP
            - self::COLLECTION;

        // Guards the test's own arithmetic, so a slip here cannot quietly agree
        // with a slip in the model.
        $this->assertSame(self::EXPECTED_CASH, $byHand);

        // And that the two bills really do round in opposite directions, which is
        // the only reason having two of them proves anything. A fixture where
        // both rounded the same way would pass with the sign dropped.
        $this->assertGreaterThan(0, self::roundingUp());
        $this->assertLessThan(0, self::roundingDown());

        $shiftId = $this->anAwkwardEvening();
        $totals = $this->till->shiftTotals($shiftId);

        $this->assertSame($byHand, $totals->expectedCash);

        // The takings side, so a failure above says which term moved.
        $this->assertSame(self::BILL_ROUNDING_UP + self::BILL_ROUNDING_DOWN, $totals->cashTaken);
        $this->assertSame(self::COLLECTION, $totals->cashPaidOut);
        $this->assertSame(self::roundingUp() + self::roundingDown(), $totals->rounding);

        /*
         * Tips are reported whole and counted in part.
         *
         * The Z-report names both tips — the waiter is owed them either way — but
         * only the one left in notes is in the box. Counting all 65 000 so'm would
         * show a surplus every night a guest tipped on a card, and a manager who
         * sees a surplus every night stops reading the number at all.
         */
        $this->assertSame(self::CASH_TIP + self::CARD_TIP, $totals->tips);
        $this->assertSame(self::EXPECTED_CASH, $totals->expectedCash);
    }

    /**
     * Money moved to the safe is not money missing from the drawer.
     */
    public function test_a_mid_shift_collection_does_not_read_as_a_shortfall(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $this->till->capture($shiftId, 201, 'A-0201', new Tender('cash', self::BILL_ROUNDING_UP));
        $this->till->recordCashOut($shiftId, self::COLLECTION, 'Inkassatsiya');

        $reduced = self::FLOAT + self::BILL_ROUNDING_UP - self::COLLECTION;
        $totals = $this->till->closeShift($shiftId, CashCount::ofTotal($reduced));

        $this->assertSame($reduced, $totals->expectedCash);
        $this->assertSame($reduced, $totals->countedCash);
        $this->assertSame(0, $totals->difference, 'A collection must never be blamed on the cashier.');

        // The takings are untouched by it — the restaurant sold that food, it
        // simply keeps the notes somewhere safer than a drawer.
        $this->assertSame(self::BILL_ROUNDING_UP, $totals->cashTaken);
    }

    /**
     * A card terminal is not a cash box: nothing it takes can be counted out of
     * one, and the acquirer's cut is deducted later from an account rather than
     * from tonight's notes.
     */
    public function test_card_takings_tips_and_fees_never_enter_expected_cash(): void
    {
        $shiftId = $this->till->openShift($this->cashier->id, self::FLOAT);
        $this->till->capture(
            $shiftId,
            301,
            'A-0301',
            new Tender('uzcard', self::CARD_TAKINGS, 'RRN-90112', self::CARD_TIP),
        );

        $totals = $this->till->shiftTotals($shiftId);

        $this->assertSame(self::FLOAT, $totals->expectedCash);
        $this->assertSame(0, $totals->cashTaken);

        // The money was recorded and the bank's 1.2% was recorded with it — this
        // is a drawer that stayed shut, not a sale that went missing.
        $this->assertSame(self::CARD_TAKINGS, $totals->totalTakings);
        $this->assertSame(self::CARD_TAKINGS, $totals->byMethod['uzcard']);
        $this->assertGreaterThan(0, $totals->fees);

        $this->assertSame(self::FLOAT, $this->till->closeShift($shiftId, CashCount::ofTotal(self::FLOAT))->expectedCash);
    }

    /**
     * An X-report is a question, not a decision — a cashier checking the drawer at
     * eight o'clock must not find her shift closed and the till refusing payments
     * for the rest of the evening.
     */
    public function test_the_x_report_closes_nothing(): void
    {
        $shiftId = $this->anAwkwardEvening();

        $x = $this->till->shiftTotals($shiftId);

        $this->assertSame('open', $x->status);
        $this->assertNull($x->countedCash);
        $this->assertNull($x->difference);

        $shift = CashShift::query()->findOrFail($shiftId);
        $this->assertSame('open', $shift->status);
        $this->assertNull($shift->closed_at);

        // Nothing was written to the stored Z figures either: they stay at the
        // zeros `openShift()` wrote until a human counts the drawer.
        $this->assertSame(0, (int) $shift->expected_cash);
        $this->assertSame(0, (int) $shift->counted_cash);
        $this->assertSame(0, (int) $shift->difference);

        // Asking twice answers twice, and the till still takes money afterwards.
        $this->assertSame($x->expectedCash, $this->till->shiftTotals($shiftId)->expectedCash);
        $this->till->capture($shiftId, 104, 'A-0104', new Tender('cash', 1_000_000));
        $this->assertSame($x->expectedCash + 1_000_000, $this->till->shiftTotals($shiftId)->expectedCash);
    }
}
