<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\BillRegistry;
use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Orders\BillTotals;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Fiscal\DemoFiscalDriver;
use Modules\Finance\Fiscal\FiscalDocument;
use Modules\Finance\Fiscal\FiscalDriver;
use Modules\Finance\Fiscal\FiscalMarks;
use Modules\Finance\Fiscal\FiscalProbe;
use Modules\Finance\Fiscal\FiscalRejected;
use Modules\Finance\Fiscal\UnavailableFiscalDriver;
use Modules\Finance\Models\FiscalReceipt;
use Modules\Finance\Models\Payment;
use Modules\Orders\Models\Order;
use RuntimeException;
use Tests\TestCase;

/**
 * The meal gets declared, and the restaurant keeps selling either way.
 *
 * Everything in P11 hangs off one sentence in the plan — *o'lik fiskal modul
 * buyurtmani hech qachon to'smaydi*, a dead fiscal module never blocks an order
 * — and that rule is only worth anything if it is true on the day soliq.uz is
 * down rather than on the day it answers. So the first test here is not the
 * happy path: it is a provider that refuses, and the assertion is that the money
 * and the bill both survive it.
 *
 * The other half is what that freedom costs. A declaration deferred forever is a
 * declaration never made, so the window closes on its own, loudly, and a cashier
 * can see what has not been filed without asking anybody.
 */
final class FiscalisationTest extends TestCase
{
    use RefreshDatabase;

    /** 30 000 so'm, in tiyin. 1 so'm = 100 tiyin. */
    private const MEAL = 30_000 * 100;

    /** The fiscal module's number: eight digits, which is what the probe checks. */
    private const MODULE_NO = '12345678';

    private Tenant $tenant;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->cashier->assignRole('cashier');

        /*
         * Fiscalisation ships switched off, because a restaurant is cooking
         * before its OFD contract exists. Every test below is about what happens
         * once it is on — except the one that asserts the default, which matters
         * just as much: a venue with no provider must still be able to sell.
         */
        config([
            'finance.fiscal.enabled' => true,
            'finance.fiscal.driver' => 'demo',
            'finance.fiscal.module_no' => self::MODULE_NO,
            'finance.fiscal.window_hours' => 24,
        ]);
    }

    // ============ The sale is never blocked ============

    public function test_a_capture_declares_the_meal_and_stamps_the_money(): void
    {
        $till = $this->withDriver(new DemoFiscalDriver(self::MODULE_NO));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $paymentId = $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL));

        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();

        $this->assertSame('sale', $receipt->kind);
        $this->assertSame('registered', $receipt->status);
        $this->assertTrue($receipt->is_legal, 'A receipt with no fiscal sign is a piece of paper.');
        $this->assertSame(self::MEAL, $receipt->total);
        $this->assertSame(self::MEAL, $receipt->cash_total);
        $this->assertSame(0, $receipt->card_total);
        $this->assertSame(self::MODULE_NO, $receipt->module_no);
        $this->assertSame($shiftId, (int) $receipt->cash_shift_id);

        // The number is on the money as well as on the document, so "which
        // declaration covers this payment" is answerable from either end.
        $this->assertSame(
            $receipt->fiscal_sign,
            Payment::query()->findOrFail($paymentId)->fiscal_receipt_no,
        );

        // The window is a fact about the row, not a setting somebody remembers.
        $this->assertNotNull($receipt->expires_at);
        $this->assertEqualsWithDelta(24 * 60, now()->diffInMinutes($receipt->expires_at), 2);
    }

    public function test_a_settlement_survives_a_provider_that_refuses(): void
    {
        $till = $this->withDriver($this->driverThatRefuses('Modul raqami noto\'g\'ri.'));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $paymentId = $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL));

        /*
         * The guest handed over notes and the bill closed. That is the whole
         * point: a restaurant that cannot sell because a tax endpoint is down
         * has been closed by an outage it did not cause.
         */
        $payment = Payment::query()->findOrFail($paymentId);
        $this->assertSame('captured', $payment->status);
        $this->assertSame(self::MEAL, $payment->amount);

        app(BillRegistry::class)->close($bill->id);
        $this->assertSame('paid', Order::query()->findOrFail($bill->id)->status);

        // And the declaration is not lost — it is queued, with the provider's own
        // sentence on it, which is the one a person can act on.
        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();
        $this->assertSame('pending', $receipt->status);
        $this->assertFalse($receipt->is_legal);
        $this->assertSame(1, $receipt->attempts);
        $this->assertSame('Modul raqami noto\'g\'ri.', $receipt->last_error);

        // Nothing was stamped on the money, because nothing was accepted.
        $this->assertNull($payment->fiscal_receipt_no);
    }

    public function test_a_venue_with_no_fiscal_module_still_sells(): void
    {
        config(['finance.fiscal.enabled' => false]);

        $till = $this->withDriver(new UnavailableFiscalDriver);
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $paymentId = $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL));

        $this->assertSame('captured', Payment::query()->findOrFail($paymentId)->status);
        $this->assertSame(0, FiscalReceipt::query()->count(), 'Nothing to declare with no provider to declare it to.');
    }

    // ============ One bill, one declaration ============

    public function test_two_tenders_on_one_bill_are_one_declaration(): void
    {
        // Unreachable on purpose: while the document is still queued it can
        // still be added to, and that is what keeps a split bill one declaration.
        $till = $this->withDriver(new UnavailableFiscalDriver);
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $till->capture($shiftId, $bill->id, $bill->number, new Tender('card', 20_000 * 100));
        $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', 10_000 * 100));

        /*
         * A table of four paying with a card and cash is two payment rows and ONE
         * declaration. Filing two would tell the tax authority the restaurant
         * sold two meals, and it would be taxed on both.
         */
        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();

        $this->assertSame(self::MEAL, $receipt->total);
        $this->assertSame(10_000 * 100, $receipt->cash_total);
        $this->assertSame(20_000 * 100, $receipt->card_total);
        $this->assertSame(2, Payment::query()->where('order_id', $bill->id)->count());
    }

    public function test_a_bill_split_between_two_tenders_reaches_the_authority_once(): void
    {
        // The same driver as a live venue, counting what it was asked to file.
        $driver = new class(self::MODULE_NO) implements FiscalDriver
        {
            public int $registrations = 0;

            private DemoFiscalDriver $provider;

            public function __construct(string $moduleNo)
            {
                $this->provider = new DemoFiscalDriver($moduleNo);
            }

            public function name(): string
            {
                return $this->provider->name();
            }

            public function probe(): FiscalProbe
            {
                return $this->provider->probe();
            }

            public function register(FiscalDocument $document): FiscalMarks
            {
                $this->registrations++;

                return $this->provider->register($document);
            }
        };

        $till = $this->withDriver($driver);
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        /*
         * One transaction around both tenders, because that is how the till
         * settles a bill: `TenderService` takes every line and closes the cheque
         * in a single transaction, so neither payment has committed while the
         * other is being written.
         */
        DB::transaction(function () use ($till, $shiftId, $bill): void {
            $till->capture($shiftId, $bill->id, $bill->number, new Tender('card', 20_000 * 100));
            $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', 10_000 * 100));
        });

        /*
         * Each capture queues the filing, and both queue the same document. The
         * second one holds the row as it looked before the first filed it, so
         * without the re-read in `file()` this table would be declared twice —
         * two fiscal signs for one meal, and revenue the restaurant is taxed on
         * and never took.
         */
        $this->assertSame(1, $driver->registrations, 'One bill, one declaration — however many cards it took.');

        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();
        $this->assertSame('registered', $receipt->status);
        $this->assertSame(self::MEAL, $receipt->total);
    }

    public function test_a_tip_only_tender_declares_nothing(): void
    {
        $till = $this->withDriver(new DemoFiscalDriver(self::MODULE_NO));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        // The guest paid the bill by card and left notes on the table. Nothing
        // was sold for the tip, so there is nothing to declare — and a zero-total
        // document would be refused all night and then expire, telling a manager
        // at midnight that a meal went undeclared when no meal ever existed.
        $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', 0, tip: 5_000 * 100));

        $this->assertSame(0, FiscalReceipt::query()->count());
        $this->assertSame(1, Payment::query()->where('order_id', $bill->id)->count());
    }

    // ============ Giving the money back ============

    public function test_a_refund_is_corrected_with_a_document_of_its_own(): void
    {
        $till = $this->withDriver(new DemoFiscalDriver(self::MODULE_NO));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $paymentId = $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL));

        /** @var FiscalReceipt $sale */
        $sale = FiscalReceipt::query()->where('kind', 'sale')->sole();

        $till->refundPayment($paymentId, 'Taom sovuq edi');

        /*
         * A filed declaration cannot be unfiled. The refund is a fiscal document
         * in its own right, and it carries the sale's sign — a reversal the
         * authority cannot match to a sale is read as a new negative sale, which
         * is a different thing and a worse one.
         *
         * Refunding at the till that served the guest is the ordinary case and it
         * used to raise nothing at all: the restaurant handed the money back and
         * stayed declared on, and taxed on, the meal.
         */
        /** @var FiscalReceipt $correction */
        $correction = FiscalReceipt::query()->where('kind', 'refund')->sole();

        $this->assertSame($sale->id, (int) $correction->parent_id);
        $this->assertSame('registered', $correction->status);
        $this->assertSame(self::MEAL, $correction->total);
        $this->assertSame(self::MEAL, $correction->cash_total);
        $this->assertNotSame($sale->fiscal_sign, $correction->fiscal_sign);
    }

    public function test_a_sale_refunded_before_it_was_ever_declared_is_voided(): void
    {
        $till = $this->withDriver(new UnavailableFiscalDriver);
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $paymentId = $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL));
        $till->refundPayment($paymentId, 'Noto\'g\'ri stol');

        // Nothing was declared, so there is nothing to correct. Filing a
        // correction here would leave a refund standing alone in the day's
        // declarations, against a sale the authority never saw.
        $this->assertSame('void', FiscalReceipt::query()->where('kind', 'sale')->sole()->status);
        $this->assertSame(0, FiscalReceipt::query()->where('kind', 'refund')->count());
    }

    // ============ The NUSXA copy ============

    public function test_a_duplicate_is_stamped_and_creates_no_second_sale(): void
    {
        $this->actingAs($this->cashier);
        $receipt = FiscalReceipt::factory()->registered()->create();

        $this->postJson("/api/v1/finance/fiscal/receipts/{$receipt->id}/duplicate")
            ->assertOk()
            ->assertJsonPath('data.id', $receipt->id)
            ->assertJsonPath('data.duplicates_printed', 1)
            ->assertJsonPath('data.fiscal_sign', $receipt->fiscal_sign)
            // What the paper carries, so nobody can present a reprint as a sale.
            ->assertJsonPath('meta.stamp', 'NUSXA')
            ->assertJsonPath('meta.copy_no', 1);

        // A duplicate is the same declaration on new paper. A second row here
        // would be a second meal the restaurant is taxed on and never sold.
        $this->assertSame(1, FiscalReceipt::query()->count());
        $this->assertSame(1, FiscalReceipt::query()->findOrFail($receipt->id)->duplicates_printed);
    }

    public function test_a_receipt_that_was_never_accepted_cannot_be_copied(): void
    {
        $this->actingAs($this->cashier);
        $receipt = FiscalReceipt::factory()->create(['status' => 'pending']);

        // Copying it would hand a guest a second piece of paper that verifies
        // nothing, stamped as though it did.
        $this->postJson("/api/v1/finance/fiscal/receipts/{$receipt->id}/duplicate")
            ->assertApiError('finance.fiscal_not_registered', 'receipt');

        $this->assertSame(0, FiscalReceipt::query()->findOrFail($receipt->id)->duplicates_printed);
    }

    // ============ The connection test ============

    public function test_the_probe_reports_an_unavailable_provider_honestly(): void
    {
        $this->app->instance(FiscalDriver::class, new UnavailableFiscalDriver);
        $this->actingAs($this->cashier);

        $this->getJson('/api/v1/finance/fiscal/probe')
            ->assertOk()
            ->assertJsonPath('data.provider', 'none')
            ->assertJsonPath('data.reachable', false)
            ->assertJsonPath('data.module_valid', false)
            // A green light above an unconfigured tax module is worse than a red
            // one: the restaurant believes it is compliant.
            ->assertJsonPath('data.ready', false)
            ->assertJsonPath('data.window_hours', 24);
    }

    public function test_the_probe_reports_the_module_number_when_something_answers(): void
    {
        $this->app->instance(FiscalDriver::class, new DemoFiscalDriver(self::MODULE_NO));
        $this->actingAs($this->cashier);

        $this->getJson('/api/v1/finance/fiscal/probe')
            ->assertOk()
            ->assertJsonPath('data.reachable', true)
            ->assertJsonPath('data.module_no', self::MODULE_NO)
            // Eight digits, and both halves of the answer have to be true before
            // this venue may be told it is connected.
            ->assertJsonPath('data.module_valid', true)
            ->assertJsonPath('data.ready', true);
    }

    public function test_a_probe_that_throws_is_an_answer_and_not_a_failure(): void
    {
        $this->app->instance(FiscalDriver::class, $this->driverThatCannotBeReached());
        $this->actingAs($this->cashier);

        // The health screen must not be the thing that breaks when the tax
        // service does.
        $this->getJson('/api/v1/finance/fiscal/probe')
            ->assertOk()
            ->assertJsonPath('data.reachable', false)
            ->assertJsonPath('data.ready', false);
    }

    // ============ The 24-hour window ============

    public function test_a_declaration_that_missed_its_window_expires_rather_than_retrying(): void
    {
        $this->app->instance(FiscalDriver::class, new DemoFiscalDriver(self::MODULE_NO));
        $accountant = $this->accountant();

        // Queued, not yet due for its next retry, and out of time. Without the
        // second sweep this row would sit un-expired for another two hours after
        // it stopped being a queue item and became a liability.
        $receipt = FiscalReceipt::factory()->create([
            'status' => 'pending',
            'attempts' => 5,
            'next_attempt_at' => now()->addHours(2),
            'expires_at' => now()->subMinute(),
        ]);

        $this->actingAs($accountant)
            ->postJson('/api/v1/finance/fiscal/relay')
            ->assertOk()
            ->assertJsonPath('data.expired', 1)
            ->assertJsonPath('data.filed', 0)
            ->assertJsonPath('data.queue.expired', 1)
            ->assertJsonPath('data.queue.pending', 0);

        $expired = FiscalReceipt::query()->findOrFail($receipt->id);
        $this->assertSame('expired', $expired->status);
        // Past the window the authority wants a correction, not a retry — so the
        // document is never sent, and it carries no sign to pretend otherwise.
        $this->assertNull($expired->fiscal_sign);

        $this->assertSame(
            1,
            StoredDomainEvent::query()->where('name', 'finance.fiscal_receipt_expired')->count(),
            'An undeclared meal that nobody is told about is how the deferral becomes never filing anything.',
        );
    }

    public function test_a_hand_run_relay_files_what_the_outage_missed(): void
    {
        $this->app->instance(FiscalDriver::class, new DemoFiscalDriver(self::MODULE_NO));
        $accountant = $this->accountant();

        // The shape of a venue coming back online: two declarations queued from
        // while the line was down, both still inside their window.
        FiscalReceipt::factory()->count(2)->create([
            'status' => 'pending',
            'attempts' => 3,
            'next_attempt_at' => now()->subMinute(),
            'expires_at' => now()->addHours(6),
        ]);

        $this->actingAs($accountant)
            ->postJson('/api/v1/finance/fiscal/relay')
            ->assertOk()
            ->assertJsonPath('data.filed', 2)
            ->assertJsonPath('data.queue.pending', 0)
            ->assertJsonPath('data.queue.expired', 0);

        $this->assertSame(2, FiscalReceipt::query()->where('status', 'registered')->count());
        $this->assertSame(0, FiscalReceipt::query()->whereNull('fiscal_sign')->count());
    }

    // ============ What the till can see ============

    public function test_the_undeclared_queue_is_visible_at_the_till(): void
    {
        $this->actingAs($this->cashier);

        FiscalReceipt::factory()->count(3)->create(['status' => 'pending', 'total' => self::MEAL]);
        FiscalReceipt::factory()->expired()->create(['total' => self::MEAL]);
        FiscalReceipt::factory()->registered()->create();

        $this->getJson('/api/v1/finance/fiscal/receipts?filter[outstanding]=1')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            // Beside the page, so a till does not have to count its own backlog.
            ->assertJsonPath('summary.pending', 3)
            ->assertJsonPath('summary.pending_total', 3 * self::MEAL)
            // The number a manager acts on: pending will probably clear itself,
            // expired never will.
            ->assertJsonPath('summary.expired', 1)
            ->assertJsonPath('summary.expired_total', self::MEAL);

        $this->getJson('/api/v1/finance/fiscal/receipts?filter[status]=expired')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'expired');
    }

    public function test_one_receipt_can_be_read_on_its_own(): void
    {
        $this->actingAs($this->cashier);
        $receipt = FiscalReceipt::factory()->registered()->create();

        $this->getJson("/api/v1/finance/fiscal/receipts/{$receipt->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $receipt->id)
            ->assertJsonPath('data.is_legal', true)
            ->assertJsonPath('data.qr_url', $receipt->qr_url);
    }

    // ============ Who may do what ============

    public function test_a_waiter_cannot_read_the_fiscal_queue(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');

        $this->actingAs($waiter)->getJson('/api/v1/finance/fiscal/receipts')->assertStatus(403);
    }

    public function test_a_cashier_cannot_drain_the_queue_by_hand(): void
    {
        // Draining is a decision about a venue that has just come back online,
        // not a button to press when a screen looks slow.
        $this->actingAs($this->cashier)->postJson('/api/v1/finance/fiscal/relay')->assertStatus(403);
    }

    public function test_the_fiscal_queue_needs_a_session(): void
    {
        $this->getJson('/api/v1/finance/fiscal/probe')->assertStatus(401);
    }

    // ============ Fixtures ============

    /**
     * A bill to be paid, built directly rather than through the POS.
     *
     * The till's own path — open, fire, settle — is Modules/Pos's to test. What
     * this file needs is a bill id and a number that Finance can attach money and
     * a declaration to.
     */
    /**
     * A bill priced the way `BillTotals` prices one: VAT already inside.
     *
     * `vat_included` was absent from this fixture, which is why every
     * declaration could be written with `vat_total = 0` for months without a
     * test noticing — there was no VAT anywhere for one to disagree with.
     */

    // ============ The VAT the authority is told about ============

    public function test_a_declaration_carries_the_vat_the_bill_already_computed(): void
    {
        $till = $this->withDriver(new DemoFiscalDriver(self::MODULE_NO));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL));

        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();

        /*
         * This was hardcoded to zero at all three sites for months.
         *
         * Nothing failed, because the fixture had no VAT either — so the
         * declaration filed with the tax authority claimed a 30 000 so'm meal
         * carried no tax, on a menu whose prices include 12%. An
         * under-declaration on every receipt, found by an auditor rather than
         * by anything here.
         */
        $this->assertSame(self::vatInside(self::MEAL), $receipt->vat_total);
        $this->assertGreaterThan(0, $receipt->vat_total);
    }

    public function test_a_split_bill_declares_the_same_vat_as_a_whole_one(): void
    {
        $till = $this->withDriver($this->driverThatRefuses('kutilmoqda'));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $half = intdiv(self::MEAL, 2);

        $till->capture($shiftId, $bill->id, $bill->number, new Tender('card', $half));
        $till->capture($shiftId, $bill->id, $bill->number, new Tender('cash', self::MEAL - $half));

        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();

        /*
         * Two tenders, one open declaration, and the VAT adds up.
         *
         * Apportioned per tender rather than recomputed from the running total,
         * so a bill paid half by card declares what a bill paid in one go
         * declares. Off by a tiyin either way, every split bill in the country
         * would disagree with its own receipt.
         */
        $this->assertSame(self::MEAL, $receipt->total);
        $this->assertEqualsWithDelta(self::vatInside(self::MEAL), $receipt->vat_total, 1);
    }

    public function test_a_delivery_fee_is_not_taxed_twice(): void
    {
        $till = $this->withDriver(new DemoFiscalDriver(self::MODULE_NO));
        $shiftId = $till->openShift($this->cashier->id, 0);

        /*
         * The case a flat `amount x 12 / 112` gets wrong.
         *
         * `BillTotals` keeps the delivery fee OUTSIDE the tax base, so the VAT
         * on this bill is 12% of the food and nothing of the courier. A rate
         * applied to the whole tender would over-declare — and over-declaring
         * is not the safe direction, it is money the restaurant hands over for
         * a service it was never taxed on.
         */
        $food = 30_000 * 100;
        $delivery = 12_000 * 100;
        $bill = $this->bill($food + $delivery, self::vatInside($food));

        $till->capture($shiftId, $bill->id, $bill->number, new Tender('card', $food + $delivery));

        /** @var FiscalReceipt $receipt */
        $receipt = FiscalReceipt::query()->where('order_id', $bill->id)->sole();

        $this->assertSame(self::vatInside($food), $receipt->vat_total);
        $this->assertLessThan(self::vatInside($food + $delivery), $receipt->vat_total);
    }

    public function test_a_refund_returns_the_vat_the_sale_declared(): void
    {
        $till = $this->withDriver(new DemoFiscalDriver(self::MODULE_NO));
        $shiftId = $till->openShift($this->cashier->id, 0);
        $bill = $this->bill();

        $paymentId = $till->capture(
            $shiftId,
            $bill->id,
            $bill->number,
            new Tender('cash', self::MEAL),
        );

        $till->refundPayment($paymentId, 'mehmon qaytardi');

        /** @var FiscalReceipt $refund */
        $refund = FiscalReceipt::query()->where('kind', 'refund')->sole();

        /*
         * `vatShareOf()` reads the sale's own `vat_total`, so with that stuck at
         * zero every correction also claimed zero — a refund that gave back the
         * money and not the tax. It follows from the sale being right, which is
         * why this is asserted here rather than trusted.
         */
        $this->assertSame(self::vatInside(self::MEAL), $refund->vat_total);
    }

    private function bill(?int $total = null, ?int $vat = null): Order
    {
        $amount = $total ?? self::MEAL;

        return Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'total' => $amount,
            'subtotal' => $amount,
            'vat_included' => $vat ?? self::vatInside($amount),
        ]);
    }

    /** 12% read OUT of an inclusive amount, exactly as BillTotals reads it. */
    private static function vatInside(int $amount): int
    {
        return (int) round(
            $amount * BillTotals::VAT_PERCENT / (100 + BillTotals::VAT_PERCENT),
        );
    }

    private function withDriver(FiscalDriver $driver): TillLedger
    {
        $this->app->instance(FiscalDriver::class, $driver);

        // Resolved after the binding, because the registrar takes its provider
        // through the constructor.
        return app(TillLedger::class);
    }

    private function accountant(): User
    {
        $accountant = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $accountant->assignRole('accountant');

        return $accountant;
    }

    /** A provider that answers, and says no. Retrying will not help. */
    private function driverThatRefuses(string $why): FiscalDriver
    {
        return new class($why) implements FiscalDriver
        {
            public function __construct(private readonly string $why) {}

            public function name(): string
            {
                return 'refusing';
            }

            public function probe(): FiscalProbe
            {
                return new FiscalProbe('refusing', true, '12345678', 'soliq.uz javob berdi.');
            }

            public function register(FiscalDocument $document): FiscalMarks
            {
                throw new FiscalRejected($this->why);
            }
        };
    }

    /** A provider whose own probe falls over. */
    private function driverThatCannotBeReached(): FiscalDriver
    {
        return new class implements FiscalDriver
        {
            public function name(): string
            {
                return 'flaky';
            }

            public function probe(): FiscalProbe
            {
                throw new RuntimeException('cURL: could not resolve host');
            }

            public function register(FiscalDocument $document): FiscalMarks
            {
                throw new RuntimeException('cURL: could not resolve host');
            }
        };
    }
}
