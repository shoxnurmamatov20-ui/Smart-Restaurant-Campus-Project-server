<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\PaymentResult;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentInvoice;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * Paying for dinner through somebody else's rails.
 *
 * Three things are being proved here and they are not equally interesting.
 *
 * The dull one is the happy path. The two that matter are **a forged callback
 * is refused** — the endpoint has no session on it, so a signature is the whole
 * of its security — and **a retried callback writes one tender**. A bank retries
 * until it gets a clean answer, and the header-based idempotency the rest of
 * this API relies on cannot help, because a bank does not send our headers.
 *
 * The refusals are asserted in each provider's OWN protocol rather than in this
 * platform's error envelope, which is the point of a driver: Payme reads
 * JSON-RPC error codes and Click reads a numeric `error` field, and neither
 * would ever reconcile a payment it was answered with `{"error":{"code":"…"}}`.
 */
final class OnlinePaymentTest extends TestCase
{
    use RefreshDatabase;

    /** 120 000 so'm, in tiyin. 1 so'm = 100 tiyin. */
    private const BILL = 120_000 * 100;

    private const PAYME_KEY = 'test-merchant-key';

    private const CLICK_SECRET = 'test-click-secret';

    private Tenant $tenant;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'served',
            'subtotal' => self::BILL,
            'total' => self::BILL,
        ]);

        config([
            'services.payments.payme.enabled' => true,
            'services.payments.payme.merchant_id' => '5e730e8e0b852a417aa49ceb',
            'services.payments.payme.key' => self::PAYME_KEY,
            'services.payments.click.enabled' => true,
            'services.payments.click.service_id' => '12345',
            'services.payments.click.merchant_id' => '54321',
            'services.payments.click.secret_key' => self::CLICK_SECRET,
            'services.payments.uzum.enabled' => false,
            'services.payments.sandbox.enabled' => true,
        ]);
    }

    // ============ What the money does to the bill behind it ============

    /**
     * A prepaid order is FIRED by the payment, not closed by it.
     *
     * The seam that was broken. `PublicOrderController` holds an online order at
     * `draft` with `payment_state = 'pending'` — no docket, no pass, no station
     * — because a kitchen that cooks before the money lands pays for every
     * abandoned checkout. Settlement then called `close()`, and the ladder has
     * no `draft → paid` step: `draft` is the one open state with no path to
     * money, since a draft has not been fired and its lines are not confirmed.
     *
     * So the transition was refused, the refusal was caught and logged, and the
     * result was a guest charged for a dinner that reached no kitchen anywhere.
     * Every test in this file passed throughout, because every one of them
     * started from a bill that had already been served.
     */
    public function test_paying_for_an_order_nobody_has_cooked_yet_sends_it_to_the_kitchen(): void
    {
        $this->order->forceFill(['status' => 'draft', 'payment_state' => 'pending'])->save();

        // A line, because an empty bill cannot be fired and refusing one is
        // right: a docket with nothing on it is a cook staring at a printer.
        // Every other test in this file starts from a bill that was served, so
        // none of them needed the lines to exist.
        OrderItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $this->order->getKey(),
        ]);

        $this->settleThroughSandbox();

        $this->order->refresh();

        $this->assertSame('placed', $this->order->status, 'The money arrived and nothing was fired.');
        $this->assertSame('paid', $this->order->payment_state);
    }

    /**
     * A bill that has already been eaten is closed by the money, as before.
     *
     * The other half of the same branch, kept honest: `markPrepaid()` must not
     * become the answer for every settlement. A table that asked for the bill is
     * at `topay`, the meal is over, and closing it is what ends the sale.
     */
    public function test_paying_for_a_meal_that_has_happened_still_closes_the_bill(): void
    {
        $this->order->forceFill(['status' => 'topay'])->save();

        $this->settleThroughSandbox();

        $this->assertSame('paid', $this->order->refresh()->status);
    }

    // ============ Which rails are on ============

    public function test_a_guest_is_offered_only_the_providers_that_are_configured(): void
    {
        // Uzum is switched off and Payme has keys. A checkout that listed a
        // provider it cannot complete fails after the guest has committed, which
        // is the worst possible moment to find a missing environment variable.
        $rails = $this->guest()->getJson('/api/v1/public/payments/providers')
            ->assertOk()
            ->json('data.*.id');

        $this->assertContains('payme', $rails);
        $this->assertContains('click', $rails);
        $this->assertNotContains('uzum', $rails);
    }

    public function test_a_provider_with_no_keys_disappears_rather_than_failing(): void
    {
        config(['services.payments.payme.key' => null]);

        $this->assertNotContains(
            'payme',
            $this->guest()->getJson('/api/v1/public/payments/providers')->assertOk()->json('data.*.id'),
        );
    }

    // ============ Opening an invoice ============

    public function test_a_guest_holding_the_bill_number_gets_somewhere_to_pay(): void
    {
        $answer = $this->openInvoice()->assertCreated();

        $this->assertSame('payme', $answer->json('data.provider'));
        $this->assertSame(self::BILL, $answer->json('data.amount'));
        $this->assertStringStartsWith('https://checkout.paycom.uz/', (string) $answer->json('data.pay_url'));

        // The database id never leaves. See the migration: an enumerable handle
        // on an endpoint with no login is every other table's bill total.
        $this->assertSame(32, mb_strlen((string) $answer->json('data.invoice_id')));
        $this->assertNull($answer->json('data.id'));
    }

    public function test_the_amount_comes_off_the_bill_and_never_from_the_payload(): void
    {
        // A client that could name its own figure is a guest paying 1 000 so'm
        // for a 120 000 so'm dinner — and the bank would confirm it happily.
        $this->openInvoice(['amount' => 1_000])->assertCreated();

        $this->assertSame(self::BILL, (int) PaymentInvoice::query()->value('amount'));
    }

    public function test_an_order_number_that_does_not_match_the_id_is_refused(): void
    {
        // The id alone is a counter a stranger can walk. Requiring the number as
        // well means the caller has to be holding the receipt.
        $this->openInvoice(['order_number' => 'A-0001'])
            ->assertNotFound()
            ->assertJsonPath('error.code', 'finance.payment_order_unknown');
    }

    public function test_a_bill_that_is_already_settled_cannot_be_paid_again(): void
    {
        $this->order->forceFill(['status' => 'paid'])->save();

        $this->openInvoice()
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'finance.payment_order_settled');
    }

    public function test_a_provider_that_is_switched_off_is_refused_by_name(): void
    {
        $this->openInvoice(['provider' => 'uzum'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'finance.payment_provider_unavailable');
    }

    public function test_another_restaurant_cannot_read_this_ones_invoice(): void
    {
        $token = (string) $this->openInvoice()->assertCreated()->json('data.invoice_id');

        Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->withHeaders(['X-Tenant' => 'lagmon-uyi', 'Accept' => 'application/json'])
            ->getJson("/api/v1/public/payments/{$token}")
            ->assertNotFound();
    }

    // ============ Payme: the bank posts to us ============

    public function test_payme_refuses_a_callback_that_carries_the_wrong_key(): void
    {
        $token = $this->paymeToken();

        $answer = $this->payme('CheckPerformTransaction', [
            'amount' => self::BILL,
            'account' => ['order_id' => $token],
        ], key: 'not-the-key');

        /*
         * -32504 and HTTP 200, both deliberate.
         *
         * The error lives inside the JSON-RPC envelope; a 401 is a transport
         * failure to Payme and it retries a forgery every minute for a day.
         */
        $answer->assertOk();
        $this->assertSame(-32504, $answer->json('error.code'));
        $this->assertNull($answer->json('result'));
    }

    public function test_payme_checks_the_amount_before_allowing_anything(): void
    {
        $token = $this->paymeToken();

        $wrong = $this->payme('CheckPerformTransaction', [
            'amount' => 1_000,
            'account' => ['order_id' => $token],
        ]);

        // -31001 is Payme's own "wrong amount", and it shows the guest a
        // specific screen. A generic code would tell them the payment system is
        // broken instead of that the figure disagrees.
        $this->assertSame(-31001, $wrong->json('error.code'));

        $right = $this->payme('CheckPerformTransaction', [
            'amount' => self::BILL,
            'account' => ['order_id' => $token],
        ]);

        $this->assertTrue($right->json('result.allow'));
    }

    public function test_payme_reports_an_unknown_order_in_its_own_account_range(): void
    {
        $answer = $this->payme('CheckPerformTransaction', [
            'amount' => self::BILL,
            'account' => ['order_id' => 'nope'],
        ]);

        // -31050..-31099 is the range Payme reserves for the merchant's own
        // account errors, and it renders the message that comes with it.
        $this->assertSame(-31050, $answer->json('error.code'));
        $this->assertSame('order_id', $answer->json('error.data'));
    }

    public function test_a_performed_payme_transaction_becomes_a_tender_and_closes_the_bill(): void
    {
        $token = $this->paymeToken();

        $this->payme('CreateTransaction', [
            'id' => 'payme-tx-1',
            'time' => now()->getTimestampMs(),
            'amount' => self::BILL,
            'account' => ['order_id' => $token],
        ])->assertOk();

        $performed = $this->payme('PerformTransaction', ['id' => 'payme-tx-1'])->assertOk();

        $this->assertSame(2, $performed->json('result.state'));

        $invoice = PaymentInvoice::query()->where('token', $token)->firstOrFail();
        $this->assertSame(PaymentResult::PAID, $invoice->state);

        $payment = Payment::query()->firstOrFail();
        $this->assertSame('payme', $payment->method);
        $this->assertSame(self::BILL, (int) $payment->amount);
        $this->assertSame((int) $this->order->getKey(), (int) $payment->order_id);

        // The other half of a settlement: Orders stops the bill being a sale.
        // The state between the two — money taken, bill still open — is the one
        // a guest can exploit by paying once and ordering twice.
        $this->assertSame('paid', Order::query()->findOrFail($this->order->getKey())->status);
    }

    public function test_a_retried_payme_perform_writes_exactly_one_tender(): void
    {
        $token = $this->paymeToken();

        $this->payme('CreateTransaction', [
            'id' => 'payme-tx-2',
            'time' => now()->getTimestampMs(),
            'amount' => self::BILL,
            'account' => ['order_id' => $token],
        ])->assertOk();

        // Six retries is not a hypothetical: Payme repeats PerformTransaction
        // until it gets a clean answer, and `Idempotency-Key` cannot help
        // because a bank sends its own headers, not ours.
        foreach (range(1, 6) as $ignored) {
            $this->payme('PerformTransaction', ['id' => 'payme-tx-2'])->assertOk();
        }

        $this->assertSame(1, Payment::query()->count());
        $this->assertSame(self::BILL, (int) Payment::query()->sum('amount'));
    }

    public function test_payme_will_not_cancel_money_that_has_already_been_banked(): void
    {
        $token = $this->paymeToken();

        $this->payme('CreateTransaction', [
            'id' => 'payme-tx-3',
            'time' => now()->getTimestampMs(),
            'amount' => self::BILL,
            'account' => ['order_id' => $token],
        ])->assertOk();
        $this->payme('PerformTransaction', ['id' => 'payme-tx-3'])->assertOk();

        /*
         * Refused rather than flipped. Undoing a banked payment is a refund —
         * it moves a drawer and a bill together — and a state change here would
         * leave the payment captured and the invoice claiming otherwise.
         */
        $cancelled = $this->payme('CancelTransaction', ['id' => 'payme-tx-3', 'reason' => 5]);

        $this->assertSame(-31008, $cancelled->json('error.code'));
        $this->assertSame(1, Payment::query()->where('status', 'captured')->count());
    }

    // ============ Click: two callbacks and an MD5 ============

    public function test_click_refuses_a_callback_whose_signature_does_not_check_out(): void
    {
        $token = $this->clickToken();

        $answer = $this->click(0, $token, signature: 'deadbeef');

        // -1 is Click's "SIGN CHECK FAILED" and is what it branches on.
        $this->assertSame(-1, $answer->json('error'));
        $this->assertSame(0, Payment::query()->count());
    }

    public function test_click_prepares_and_completes_into_one_tender(): void
    {
        $token = $this->clickToken();

        $prepare = $this->click(0, $token)->assertOk();
        $this->assertSame(0, $prepare->json('error'));

        $prepareId = (int) $prepare->json('merchant_prepare_id');

        $complete = $this->click(1, $token, prepareId: $prepareId)->assertOk();
        $this->assertSame(0, $complete->json('error'));

        $this->assertSame(PaymentResult::PAID, PaymentInvoice::query()->where('token', $token)->value('state'));
        $this->assertSame(1, Payment::query()->count());
        $this->assertSame('click', Payment::query()->value('method'));
    }

    public function test_click_refuses_an_amount_that_disagrees_with_the_bill(): void
    {
        $token = $this->clickToken();

        // Click sends so'm with decimals while this platform stores tiyin. A
        // driver that compared the two directly would be out by a factor of a
        // hundred in the direction that lets a guest pay 1% of the bill.
        $this->assertSame(-2, $this->click(0, $token, amount: '1200.00')->json('error'));
        $this->assertSame(0, Payment::query()->count());
    }

    public function test_a_completed_click_payment_cannot_be_prepared_again(): void
    {
        $token = $this->clickToken();

        $prepareId = (int) $this->click(0, $token)->json('merchant_prepare_id');
        $this->click(1, $token, prepareId: $prepareId)->assertOk();

        // -4 is "already paid". Answering 0 would invite a second Complete and
        // a second tender for one meal.
        $this->assertSame(-4, $this->click(0, $token)->json('error'));
        $this->assertSame(1, Payment::query()->count());
    }

    // ============ Helpers ============

    private function guest(): self
    {
        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json']);

        return $this;
    }

    /** @param array<string, mixed> $over */
    private function openInvoice(array $over = []): TestResponse
    {
        return $this->guest()->postJson('/api/v1/public/payments/invoice', [
            'order_id' => $this->order->getKey(),
            'order_number' => $this->order->number,
            'provider' => 'payme',
            ...$over,
        ]);
    }

    /**
     * Take the money on the rail that has no bank behind it.
     *
     * `SandboxGateway` settles inside `createInvoice()` rather than waiting for
     * a callback, and that is deliberate on its side: deferring it to a fake
     * callback would test the callback route rather than the flow, and the
     * callback route has its own tests in this file with the real protocols in
     * them. Here it means one request settles one bill.
     */
    private function settleThroughSandbox(): void
    {
        $this->openInvoice(['provider' => 'sandbox'])->assertCreated();
    }

    private function paymeToken(): string
    {
        return (string) $this->openInvoice()->assertCreated()->json('data.invoice_id');
    }

    private function clickToken(): string
    {
        return (string) $this->openInvoice(['provider' => 'click'])->assertCreated()->json('data.invoice_id');
    }

    /** @param array<string, mixed> $params */
    private function payme(string $method, array $params, ?string $key = null): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
            'Authorization' => 'Basic '.base64_encode('Paycom:'.($key ?? self::PAYME_KEY)),
        ])->postJson('/api/v1/payments/payme/callback', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => $method,
            'params' => $params,
        ]);
    }

    private function click(
        int $action,
        string $token,
        ?int $prepareId = null,
        string $amount = '120000.00',
        ?string $signature = null,
    ): TestResponse {
        $clickTransId = '900001';
        $serviceId = '12345';
        $signTime = '2026-08-21 20:00:00';

        $fields = [$clickTransId, $serviceId, self::CLICK_SECRET, $token];

        if ($action === 1) {
            // Present in Complete and absent from Prepare. Getting this wrong
            // verifies half the callbacks and rejects the other half — payments
            // taken and never confirmed.
            $fields[] = (string) $prepareId;
        }

        $fields[] = $amount;
        $fields[] = (string) $action;
        $fields[] = $signTime;

        $payload = [
            'click_trans_id' => $clickTransId,
            'service_id' => $serviceId,
            'click_paydoc_id' => '777',
            'merchant_trans_id' => $token,
            'amount' => $amount,
            'action' => $action,
            'error' => 0,
            'error_note' => 'Success',
            'sign_time' => $signTime,
            'sign_string' => $signature ?? md5(implode('', $fields)),
        ];

        if ($prepareId !== null) {
            $payload['merchant_prepare_id'] = $prepareId;
        }

        return $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->post('/api/v1/payments/click/callback', $payload);
    }
}
