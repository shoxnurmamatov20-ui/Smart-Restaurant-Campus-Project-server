<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\Finance\CashRounding;
use App\Support\Finance\TenderPlan;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * The arithmetic between a guest handing money over and a payment row existing.
 *
 * Every case below is one an adversarial audit of this class produced by hand,
 * and three of them were real defects it found. They are kept as tests rather
 * than as a note because each one is silent in production: the drawer still
 * reconciles, the bill still closes, and the only trace is a Z-report that is a
 * few hundred so'm away from the bills it is supposed to sum.
 *
 * The one invariant behind all of them, and the thing to check first when any of
 * these fail: **what the guest handed over equals what was recorded plus what
 * was handed back.** `offered == applied + tips + rounding + change`. Money is
 * conserved or the test is wrong about the world.
 *
 * No database. This is a pure calculator on purpose — see the class note — so it
 * is tested where it is cheapest, which means these run in milliseconds and can
 * cover every branch instead of the two a feature test has patience for.
 */
final class TenderPlanTest extends TestCase
{
    /** 1 000 so'm, the note a drawer can actually pay out. */
    private const STEP = CashRounding::STEP_TIYIN;

    /**
     * @param  array<int, array{method: string, amount: int, tip?: int}>  $tenders
     */
    private function plan(int $due, array $tenders, int $step = self::STEP): TenderPlan
    {
        return TenderPlan::of($due, $tenders, $step);
    }

    /** What was handed over must equal what was kept, tipped, rounded and returned. */
    private function assertMoneyIsConserved(TenderPlan $plan): void
    {
        $this->assertSame(
            $plan->offered,
            $plan->applied + $plan->tips + $plan->rounding + $plan->change,
            'offered != applied + tips + rounding + change — money appeared or vanished',
        );
    }

    // ============ The ordinary paths ============

    #[Test]
    public function a_cash_sale_rounds_the_bill_and_records_the_difference(): void
    {
        // 45 240 so'm, paid with a 50 000 note.
        $plan = $this->plan(4_524_000, [['method' => 'cash', 'amount' => 5_000_000]]);

        $this->assertTrue($plan->settled);
        // Revenue is the bill, un-rounded: the restaurant sold 45 240 so'm of food.
        $this->assertSame(4_524_000, $plan->cashRevenue);
        // The rounding is the separate, signed gain or loss — here a loss of 240.
        $this->assertSame(-24_000, $plan->rounding);
        // So the drawer receives 45 000 and the guest gets 5 000 back.
        $this->assertSame(4_500_000, $plan->cashToCollect());
        $this->assertSame(500_000, $plan->change);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function rounding_goes_up_as_well_as_down(): void
    {
        // 45 500 so'm sits exactly on a half-step: ties go up, so the guest pays
        // 46 000. A test that only ever saw the downward case would pass against
        // an unsigned column that silently mangles every gain into a loss.
        $plan = $this->plan(4_550_000, [['method' => 'cash', 'amount' => 5_000_000]]);

        $this->assertSame(50_000, $plan->rounding);
        $this->assertSame(4_600_000, $plan->cashToCollect());
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_card_pays_the_exact_total_with_no_rounding(): void
    {
        // Rounding is a property of paying in NOTES. A card charges to the tiyin,
        // so applying it here would take up to 500 so'm a sale off a guest who
        // never handed over a note.
        $plan = $this->plan(4_524_000, [['method' => 'visa', 'amount' => 4_524_000]]);

        $this->assertTrue($plan->settled);
        $this->assertSame(0, $plan->rounding);
        $this->assertSame(0, $plan->change);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_split_rounds_the_cash_remainder_and_not_the_whole_bill(): void
    {
        /*
         * The case that proves the screen and the settlement agree.
         *
         * 50 490 so'm, of which 20 123 goes on a card — a deliberately unround
         * figure. The remainder is 30 367, which rounds to 30 000; rounding the
         * WHOLE bill instead would give 50 000 and leave the cash side asking for
         * 29 877, a different number by 123 so'm.
         */
        $plan = $this->plan(5_049_000, [
            ['method' => 'visa', 'amount' => 2_012_300],
            ['method' => 'cash', 'amount' => 4_000_000],
        ]);

        $this->assertTrue($plan->settled);
        $this->assertSame(3_036_700, $plan->cashRevenue);
        $this->assertSame(-36_700, $plan->rounding);
        $this->assertSame(3_000_000, $plan->cashToCollect());
        $this->assertSame(1_000_000, $plan->change);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_part_payment_is_not_rounded(): void
    {
        // The guest is coming back with the rest. Rounding a running balance moves
        // the goalposts between two halves of one transaction.
        $plan = $this->plan(4_524_000, [['method' => 'cash', 'amount' => 1_000_000]]);

        $this->assertFalse($plan->settled);
        $this->assertSame(0, $plan->rounding);
        $this->assertSame(1_000_000, $plan->cashRevenue);
        $this->assertSame(3_524_000, $plan->remaining);
        $this->assertSame(0, $plan->change);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_terminal_set_to_exact_change_does_not_round(): void
    {
        $plan = $this->plan(4_524_000, [['method' => 'cash', 'amount' => 5_000_000]], step: 1);

        $this->assertSame(0, $plan->rounding);
        $this->assertSame(476_000, $plan->change);
        $this->assertMoneyIsConserved($plan);
    }

    // ============ The three defects an audit found ============

    #[Test]
    public function a_card_that_falls_just_short_does_not_close_the_bill(): void
    {
        /*
         * The worst of the three, and completely silent.
         *
         * The rounding branch was entered whenever `cashHanded >= round(cashDue)`,
         * and `round()` answers 0 for any remainder below half a step — so with NO
         * CASH AT ALL, `0 >= 0` held. A 50 490 so'm bill paid with 50 000 on a card
         * closed as fully settled: 490 so'm of revenue became a "rounding" that the
         * payment loop then dropped, because it only writes rounding onto a cash
         * row.
         *
         * Systematic, not an edge case: every card-only settlement short by less
         * than half a step, up to 499.99 so'm a bill, with nothing anywhere naming
         * the difference.
         */
        $plan = $this->plan(5_049_000, [['method' => 'visa', 'amount' => 5_000_000]]);

        $this->assertFalse($plan->settled, 'a bill nobody finished paying must not close');
        $this->assertSame(49_000, $plan->remaining);
        $this->assertSame(0, $plan->rounding, 'nothing was tendered in cash, so nothing rounds');
        $this->assertSame(5_000_000, $plan->applied);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_tiny_non_cash_payment_cannot_settle_a_whole_bill(): void
    {
        // The same defect at its most extreme: one so'm on a company account
        // closing a 400 so'm bill, because the 39 900 tiyin remainder rounded to
        // nothing.
        $plan = $this->plan(40_000, [['method' => 'corporate', 'amount' => 100]]);

        $this->assertFalse($plan->settled);
        $this->assertSame(39_900, $plan->remaining);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function cash_left_on_a_bill_the_card_already_covered_is_change(): void
    {
        /*
         * `cashRevenue` was initialised to everything handed over and only narrowed
         * inside the rounding branch — so when a card covered the bill exactly,
         * `cashDue` was 0, the branch was skipped, and notes on the counter became
         * revenue with `change` still 0.
         *
         * A guest paying a 50 000 so'm bill by card and putting 10 000 down got two
         * payment rows totalling 60 000, no change back, and a drawer that
         * reconciled perfectly against a Z-report 10 000 above the bill. Nothing
         * ever flagged it.
         */
        $plan = $this->plan(5_000_000, [
            ['method' => 'visa', 'amount' => 5_000_000],
            ['method' => 'cash', 'amount' => 1_000_000],
        ]);

        $this->assertTrue($plan->settled);
        $this->assertSame(0, $plan->cashRevenue, 'the bill was already paid — none of this is takings');
        $this->assertSame(1_000_000, $plan->change);
        $this->assertSame(5_000_000, $plan->applied);
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_card_paid_bill_with_a_cash_tip_is_a_settlement_not_a_refusal(): void
    {
        /*
         * The commonest tipping flow there is, and it could not be recorded at all.
         *
         * The cash line's whole value is a tip, so nothing of it goes onto the bill
         * and its amount is 0 — which `TillLedger::capture()` refused, inside the
         * settlement's transaction, rolling back the CARD PAYMENT ALREADY WRITTEN.
         * The card had physically been charged at the terminal and the tip notes
         * were in the drawer; the till answered "refused" and the bill stayed open.
         */
        $plan = $this->plan(5_000_000, [
            ['method' => 'uzcard', 'amount' => 5_000_000],
            ['method' => 'cash', 'amount' => 1_000_000, 'tip' => 1_000_000],
        ]);

        $this->assertTrue($plan->settled);
        $this->assertSame(5_000_000, $plan->applied, 'a tip never pays down the bill');
        $this->assertSame(1_000_000, $plan->tips);
        $this->assertSame(1_000_000, $plan->cashTips, 'tipped in notes, so it is in the drawer');
        $this->assertSame(0, $plan->cashRevenue);
        $this->assertSame(0, $plan->change);
        $this->assertMoneyIsConserved($plan);
    }

    // ============ Tips ============

    #[Test]
    public function a_tip_rides_on_top_and_never_pays_down_the_bill(): void
    {
        // 45 000 so'm bill, 50 000 handed over, 5 000 of it meant as a tip.
        $plan = $this->plan(4_500_000, [
            ['method' => 'cash', 'amount' => 5_000_000, 'tip' => 500_000],
        ]);

        $this->assertTrue($plan->settled);
        $this->assertSame(4_500_000, $plan->applied);
        $this->assertSame(500_000, $plan->tips);
        $this->assertSame(0, $plan->change, 'the guest handed over exactly the bill plus the tip');
        $this->assertMoneyIsConserved($plan);
    }

    #[Test]
    public function a_card_tip_is_not_in_the_drawer(): void
    {
        $plan = $this->plan(4_500_000, [
            ['method' => 'humo', 'amount' => 5_000_000, 'tip' => 500_000],
        ]);

        $this->assertSame(500_000, $plan->tips);
        $this->assertSame(0, $plan->cashTips, 'it went to the bank, not the box');
        $this->assertMoneyIsConserved($plan);
    }

    // ============ What is refused, and why it is refused rather than adjusted ============

    #[Test]
    public function a_tip_larger_than_the_tender_is_refused(): void
    {
        $this->expectException(RuntimeException::class);

        // The guest cannot tip money they did not hand over.
        $this->plan(4_500_000, [['method' => 'cash', 'amount' => 100_000, 'tip' => 200_000]]);
    }

    #[Test]
    public function two_cash_lines_are_refused(): void
    {
        $this->expectException(RuntimeException::class);

        // Rounding and change both attach to the cash side and there is no
        // non-arbitrary answer to which of two lines carries them. A drawer does
        // not care whose notes they were.
        $this->plan(4_500_000, [
            ['method' => 'cash', 'amount' => 2_000_000],
            ['method' => 'cash', 'amount' => 2_500_000],
        ]);
    }

    #[Test]
    public function overpaying_by_card_is_refused(): void
    {
        $this->expectException(RuntimeException::class);

        // A card terminal cannot hand notes back, and treating the excess as a tip
        // would decide that on the guest's behalf.
        $this->plan(4_500_000, [['method' => 'visa', 'amount' => 5_000_000]]);
    }

    #[Test]
    public function a_zero_amount_is_refused(): void
    {
        $this->expectException(RuntimeException::class);

        $this->plan(4_500_000, [['method' => 'cash', 'amount' => 0]]);
    }

    #[Test]
    public function an_empty_settlement_is_refused(): void
    {
        $this->expectException(RuntimeException::class);

        $this->plan(4_500_000, []);
    }
}
