<?php

declare(strict_types=1);

namespace Modules\Marketplace\Tests\Unit;

use Modules\Marketplace\Services\MarketPricing;
use PHPUnit\Framework\TestCase;

/**
 * The arithmetic, on its own, with no database anywhere near it.
 *
 * Two percentages that are not the same percentage — 3% from the guest, 9% from
 * the merchant — and the whole of this file is about keeping them apart. A bug
 * here is not a wrong pixel: it is a restaurant paid the wrong amount every week
 * until somebody adds it up by hand.
 *
 * The figures are worked through in the assertions rather than fetched from a
 * fixture, so that a reader can check them without running anything.
 */
final class MarketPricingTest extends TestCase
{
    public function test_the_guest_pays_the_food_plus_three_percent_plus_delivery(): void
    {
        //   subtotal        11 800 000
        //   service 3%         354 000
        //   delivery         1 200 000
        //   total           13 354 000
        $totals = MarketPricing::of(subtotal: 11_800_000, deliveryFee: 1_200_000);

        $this->assertSame(11_800_000, $totals->subtotal);
        $this->assertSame(354_000, $totals->serviceFee);
        $this->assertSame(1_200_000, $totals->deliveryFee);
        $this->assertSame(13_354_000, $totals->total);
    }

    public function test_the_merchant_is_paid_the_food_less_nine_percent(): void
    {
        $totals = MarketPricing::of(subtotal: 11_800_000, deliveryFee: 1_200_000);

        // 9% of 11 800 000 = 1 062 000.
        $this->assertSame(1_062_000, $totals->commission);
        $this->assertSame(10_738_000, $totals->merchantDue);

        // And the two figures are complementary, always. This is the assertion
        // that would catch a commission accidentally taken on the total.
        $this->assertSame($totals->subtotal, $totals->commission + $totals->merchantDue);
    }

    public function test_the_commission_never_touches_delivery_or_the_service_fee(): void
    {
        $withDelivery = MarketPricing::of(subtotal: 10_000_000, deliveryFee: 5_000_000);
        $without = MarketPricing::of(subtotal: 10_000_000, deliveryFee: 0);

        /*
         * The delivery fee is the platform's, charged to the guest and paid to a
         * courier; the restaurant never sees it. A commission that grew with it
         * would take 9% of somebody else's revenue — the exact double-charge
         * `OrderChannel::Aggregator` warns about one module over.
         */
        $this->assertSame($withDelivery->commission, $without->commission);
        $this->assertSame(900_000, $withDelivery->commission);
    }

    public function test_a_promo_comes_off_the_guests_bill_and_not_the_restaurants(): void
    {
        //   subtotal        50 000 000
        //   promo          − 5 000 000
        //   base            45 000 000
        //   service 3%       1 350 000
        //   total           46 350 000
        $totals = MarketPricing::of(subtotal: 50_000_000, discount: 500_000_0);

        $this->assertSame(5_000_000, $totals->discount);
        $this->assertSame(1_350_000, $totals->serviceFee);
        $this->assertSame(46_350_000, $totals->total);

        /*
         * And the merchant is still paid on the full price of the food they
         * cooked. The platform funded the campaign; a restaurant that had it
         * deducted from their payout would be co-funding a promotion they never
         * agreed to run.
         */
        $this->assertSame(4_500_000, $totals->commission);
        $this->assertSame(45_500_000, $totals->merchantDue);
    }

    public function test_the_service_charge_is_taken_after_the_discount(): void
    {
        $discounted = MarketPricing::of(subtotal: 100_000_000, discount: 10_000_000);
        $full = MarketPricing::of(subtotal: 100_000_000);

        // Charging service on the pre-discount subtotal quietly makes a 10%
        // discount worth 9.7%. `BillTotals` states the same rule for the
        // restaurant's own bills, and the two must not disagree.
        $this->assertSame(2_700_000, $discounted->serviceFee);
        $this->assertSame(3_000_000, $full->serviceFee);
    }

    public function test_a_discount_larger_than_the_basket_cannot_produce_a_refund(): void
    {
        $totals = MarketPricing::of(subtotal: 3_000_000, discount: 9_000_000, deliveryFee: 1_000_000);

        // Clamped, not refused. By the time a total is being added up, zero is
        // the only sane answer left — and a negative total is money the
        // marketplace never agreed to hand out.
        $this->assertSame(3_000_000, $totals->discount);
        $this->assertSame(0, $totals->serviceFee);
        $this->assertSame(1_000_000, $totals->total);
    }

    public function test_rounding_is_half_up_and_never_goes_through_a_float(): void
    {
        // 3% of 1 683 333 is 50 499.99 — half up is 50 500.
        $this->assertSame(50_500, MarketPricing::percentOf(1_683_333, 3));

        // Exactly a half rounds up: 9% of 5 050 is 454.5 → 455.
        $this->assertSame(455, MarketPricing::percentOf(5_050, 9));

        // And below a half rounds down: 9% of 5 049 is 454.41 → 454.
        $this->assertSame(454, MarketPricing::percentOf(5_049, 9));

        /*
         * And it stays exact at a size where a float would not.
         *
         * 3% of 999 999 999 999 is 29 999 999 999.97 — floating point gets that
         * wrong in the last digit, and this platform's largest amounts are the
         * ones a settlement is reconciled against.
         */
        $this->assertSame(30_000_000_000, MarketPricing::percentOf(999_999_999_999, 3));
    }

    public function test_a_zero_rate_is_taken_seriously(): void
    {
        // A negotiated 0% commission is a real commercial term, and it must
        // produce no charge rather than falling back to a default.
        $totals = MarketPricing::of(subtotal: 10_000_000, servicePercent: 0, commissionPercent: 0);

        $this->assertSame(0, $totals->serviceFee);
        $this->assertSame(0, $totals->commission);
        $this->assertSame(10_000_000, $totals->merchantDue);
        $this->assertSame(10_000_000, $totals->total);
    }

    public function test_a_free_delivery_is_simply_zero(): void
    {
        $totals = MarketPricing::of(subtotal: 8_000_000, deliveryFee: 0);

        // What a MyPOS Plus basket looks like: the fee is not discounted, it is
        // not charged. There is no line for it on the summary.
        $this->assertSame(0, $totals->deliveryFee);
        $this->assertSame(8_240_000, $totals->total);
    }
}
