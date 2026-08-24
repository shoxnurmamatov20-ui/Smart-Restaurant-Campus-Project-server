<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\CashCount;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Finance\AcquirerFees;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Finance\Models\Payment;
use ReflectionMethod;
use ReflectionParameter;
use Tests\TestCase;

/**
 * What the bank keeps out of a card sale, and who is allowed to say how much.
 *
 * A card sale and a cash sale of the same size are not the same amount of money.
 * The acquirer takes 1.2% on an Uzcard and 2.4% on a Visa, and takes it days
 * later out of an account rather than out of the drawer. Four promises have to
 * hold before an owner can ever reconcile card revenue against a bank statement,
 * and each one is a different way to lose that argument:
 *
 *   The rate belongs to Finance. A till that could send the fee could send zero,
 *   and card revenue would differ from the statement by exactly the amount
 *   somebody chose not to declare.
 *
 *   The rate is a snapshot on the row. A contract renegotiated in March must not
 *   restate February's margins — the same reason a bill line keeps its own copy
 *   of the price.
 *
 *   The rate is negotiable per restaurant. A chain with volume pays less than a
 *   single café, and neither should need a deploy to say so.
 *
 *   The fee never reaches the drawer. The guest handed over the full amount; a
 *   fee that leaked into `expected_cash` would end every card-heavy shift short,
 *   and the cashier counting the notes would be blamed for a percentage the bank
 *   charged.
 */
final class AcquirerFeeTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private TillLedger $till;

    private int $shiftId;

    /** Each capture gets its own bill, so a failure names one payment. */
    private int $orderSeq = 900;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->till = app(TillLedger::class);

        // A 100 000 so'm float, so the expected drawer is never accidentally
        // equal to the takings and a test cannot pass on a coincidence.
        $this->shiftId = $this->till->openShift($cashier->id, 10_000_000);
    }

    // ============ The published schedule ============

    public function test_each_scheme_is_charged_at_its_documented_rate(): void
    {
        /*
         * A hundred thousand so'm on each method, with the fee written out in
         * tiyin instead of recomputed from the rate. A test that repeats the
         * production formula agrees with the code even when the code is wrong,
         * and these nine figures are the ones an owner would check by hand.
         */
        $schedule = [
            'uzcard' => [120, 120_000],
            'humo' => [120, 120_000],
            'visa' => [240, 240_000],
            'mastercard' => [240, 240_000],
            'click' => [150, 150_000],
            'payme' => [150, 150_000],
            'uzum' => [150, 150_000],
            // Notes and a company transfer cost the restaurant nothing: no
            // acquirer stands between the guest and the till.
            'cash' => [0, 0],
            'corporate' => [0, 0],
        ];

        foreach ($schedule as $method => [$bps, $fee]) {
            $payment = $this->capture($method, 10_000_000);

            $this->assertSame($bps, $payment->fee_bps, "{$method} should be charged at {$bps} bps.");
            $this->assertSame($fee, $payment->fee_amount, "{$method} on 100 000 so'm should cost {$fee} tiyin.");
        }
    }

    /**
     * A method with no published rate falls through to zero, silently and for
     * ever: the eleventh scheme somebody adds to the till would look free.
     */
    public function test_every_method_the_till_accepts_has_a_published_rate(): void
    {
        $undocumented = array_diff(Payment::METHODS, array_keys(AcquirerFees::defaults()));

        $this->assertSame(
            [],
            $undocumented,
            'These methods can be captured but have no rate, so they cost 0%: '
                .implode(', ', $undocumented),
        );
    }

    /**
     * `card` predates the per-scheme methods and is deliberately free.
     */
    public function test_the_generic_card_method_declares_no_fee_rather_than_a_guess(): void
    {
        /*
         * A till still sending `card` has not said whether the guest tapped an
         * Uzcard at 1.2% or a Visa at 2.4%. Splitting the difference would put a
         * figure in a margin report that no line of any bank statement supports,
         * and nobody would ever trace it back. A zero is visibly missing, and a
         * visibly missing number is the one a person actually investigates.
         */
        $payment = $this->capture('card', 10_000_000);

        $this->assertSame(0, $payment->fee_bps);
        $this->assertSame(0, $payment->fee_amount);

        // Free, but still accepted — an old till has to keep taking money.
        $this->assertContains('card', Payment::METHODS);
    }

    // ============ Whose number it is ============

    public function test_nothing_a_till_sends_can_name_the_fee(): void
    {
        /*
         * `Tender` is the entire vocabulary a caller has for a payment, and
         * `capture()` is the only door. Neither has a place to put a fee, which
         * is the structural half of the promise: a client cannot under-declare
         * what it cannot express.
         */
        $this->assertSame(
            ['method', 'amount', 'reference', 'tip'],
            array_keys((new Tender('visa', 10_000_000))->toArray()),
        );

        $capture = new ReflectionMethod(TillLedger::class, 'capture');
        $this->assertSame(
            ['shiftId', 'orderId', 'orderNumber', 'tender', 'rounding'],
            array_map(
                static fn (ReflectionParameter $parameter): string => $parameter->getName(),
                $capture->getParameters(),
            ),
        );

        // And the behavioural half: the row comes out charged anyway, from a
        // call that said nothing whatsoever about a bank.
        $this->assertSame(240_000, $this->capture('visa', 10_000_000)->fee_amount);
    }

    // ============ A rate is a snapshot, not a lookup ============

    public function test_a_rate_renegotiated_later_does_not_restate_an_earlier_payment(): void
    {
        $february = $this->capture('visa', 10_000_000);

        // The bank puts Visa up to 3% and the restaurant records the new deal.
        $this->negotiate(['visa' => 300]);

        $march = $this->capture('visa', 10_000_000);

        /*
         * Asserted first on purpose. If the new setting were never read, every
         * assertion below would pass while proving nothing — the February row
         * would keep 240 bps because 240 bps is all this tenant ever had.
         */
        $this->assertSame(300, $march->fee_bps);
        $this->assertSame(300_000, $march->fee_amount);

        $february->refresh();

        // February's margin was reported to an owner months ago. A rate agreed
        // afterwards must not change what that month is now said to have earned.
        $this->assertSame(240, $february->fee_bps);
        $this->assertSame(240_000, $february->fee_amount);
    }

    public function test_a_restaurant_that_negotiated_its_own_rate_pays_that_rate(): void
    {
        // Fifty branches of volume buys 0.9% on Uzcard where a single café pays
        // the platform's 1.2%.
        $this->negotiate(['uzcard' => 90]);

        $uzcard = $this->capture('uzcard', 10_000_000);

        $this->assertSame(90, $uzcard->fee_bps);
        $this->assertSame(90_000, $uzcard->fee_amount);

        // One method moved, not the whole schedule. Visa was not part of that
        // conversation, and an override that quietly zeroed the methods it did
        // not mention would make the rest of the card revenue look free.
        $this->assertSame(240, $this->capture('visa', 10_000_000)->fee_bps);
    }

    public function test_a_negative_negotiated_rate_is_read_as_no_fee(): void
    {
        // No acquirer pays a restaurant per transaction. A minus sign typed into
        // settings would otherwise report net card revenue larger than the
        // bills the guests actually paid.
        $this->negotiate(['visa' => -240]);

        $payment = $this->capture('visa', 10_000_000);

        $this->assertSame(0, $payment->fee_bps);
        $this->assertSame(0, $payment->fee_amount);
    }

    // ============ The drawer never sees it ============

    public function test_a_fee_neither_leaves_the_drawer_nor_reduces_the_takings(): void
    {
        $this->capture('cash', 30_000_000);
        $this->capture('visa', 20_000_000);

        $x = $this->till->shiftTotals($this->shiftId);

        // 500 000 so'm was sold, and all of it is takings: the guest paid the
        // full price of the meal on both bills.
        $this->assertSame(50_000_000, $x->totalTakings);
        // The acquirer's 2.4% of the card half is reported beside the takings so
        // net revenue has a name — never subtracted from them.
        $this->assertSame(480_000, $x->fees);
        // The float plus the cash bill. Nothing card-shaped is in the box, fee
        // or otherwise.
        $this->assertSame(40_000_000, $x->expectedCash);

        $z = $this->till->closeShift($this->shiftId, CashCount::ofTotal(40_000_000));

        /*
         * The reason this test exists. The cashier counted the notes correctly,
         * and she is not 4 800 so'm short because of a deduction the bank makes
         * days later, out of an account, from money that never passed through
         * her hands. A fee inside `expected_cash` would show her as a thief
         * every night she took a card.
         */
        $this->assertSame(0, $z->difference);
        $this->assertSame(40_000_000, $z->countedCash);
        $this->assertSame(50_000_000, $z->totalTakings);
        $this->assertSame(480_000, $z->fees);
    }

    // ============ Fractions of a tiyin ============

    public function test_the_fee_rounds_down_so_the_recorded_net_is_never_optimistic(): void
    {
        /*
         * 2.4% of a 45 557 so'm bill is 109 336.8 tiyin, and eight tenths of a
         * tiyin is not money. The bank's statement is in whole units, so the fee
         * is truncated rather than rounded to nearest: erring towards the
         * smaller deduction means the net the restaurant has written down is
         * never larger than what actually lands in the account. The other
         * direction overstates income by a fraction on every single card sale.
         */
        $visa = $this->capture('visa', 4_555_700);

        $this->assertSame(109_336, $visa->fee_amount);

        // 1.2% of the same bill is 54 668.4 tiyin.
        $uzcard = $this->capture('uzcard', 4_555_700);

        $this->assertSame(54_668, $uzcard->fee_amount);
    }

    // ============ Helpers ============

    private function capture(string $method, int $amount): Payment
    {
        $this->orderSeq++;

        $paymentId = $this->till->capture(
            $this->shiftId,
            $this->orderSeq,
            sprintf('A-%04d', $this->orderSeq),
            new Tender($method, $amount),
        );

        return Payment::query()->findOrFail($paymentId);
    }

    /**
     * Record this restaurant's own deal with its bank.
     *
     * @param  array<string, int>  $bps  Basis points, keyed by payment method.
     */
    private function negotiate(array $bps): void
    {
        $this->tenant->update(['settings' => ['acquirer_fees_bps' => $bps]]);

        // Over HTTP the tenant is resolved from the database on every request.
        // Here the context is holding a model, so it is handed the updated one.
        app(TenantContext::class)->set($this->tenant);
    }
}
