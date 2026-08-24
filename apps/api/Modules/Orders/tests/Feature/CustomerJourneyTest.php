<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Contracts\Finance\PaymentResult;
use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\PromoCode;
use Modules\Crm\Models\PromoRedemption;
use Modules\Finance\Models\PaymentInvoice;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * The whole customer app, end to end, in one test.
 *
 * Six agents built the pieces of this and each stopped at the next one's seam.
 * Every link below was separately covered and separately green, and the chain
 * was still broken in three places — which is exactly the failure a per-module
 * test suite cannot see:
 *
 *   **The promo code was a string nobody read.** A guest typed OSH15, the cart
 *   subtracted fifteen percent in the browser, and the bill charged full price.
 *   `PublicOrderRequest` said so in its own docblock: "recorded, never trusted
 *   … there is no contract Orders could call to ask."
 *
 *   **An order paid online was never cooked.** It waits at `draft` with
 *   `payment_state = 'pending'` — that part was right — and the settlement
 *   called `close()`, which the ladder refuses from `draft`. The refusal was
 *   caught and logged, so the money arrived, the invoice read `paid`, and no
 *   kitchen anywhere saw a docket.
 *
 *   **A guest's own history did not exist.** `GET /public/me` reported
 *   `orders_count`, and the only list behind that number was a fixture.
 *
 * So the test is deliberately one long method for the main path. Split into
 * six, each would set up the state the previous one produced, and a break in
 * the joins between them is the one thing that could not fail.
 *
 * ---------------------------------------------------------------------------
 * Why this lives in Orders
 *
 * It crosses CRM, Menu, Orders, Kitchen and Finance, and a test may import what
 * a module may not — `ModuleBoundaryTest` scopes its rule to `app/` and
 * `Modules/{X}/app/`. Orders owns it because the bill is the spine: every other
 * module in the chain is doing something to one.
 */
final class CustomerJourneyTest extends TestCase
{
    use RefreshDatabase;

    /** The one code an automated test is allowed to know. See OtpCredentials. */
    private const TEST_CODE = '0000';

    private const PHONE = '+998901234567';

    /** 45 000 so'm, in tiyin. */
    private const OSH = 45_000_00;

    private Tenant $tenant;

    private Branch $branch;

    private MenuItem $osh;

    /** The gateway, recording rather than sending. @var object{sent: list<array{phone: string, text: string}>} */
    private object $gateway;

    /** What `auth.defaults.guard` was before any staff request moved it. */
    private string $defaultGuard;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->defaultGuard = (string) config('auth.defaults.guard');

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->osh = MenuItem::factory()
            ->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', self::OSH)
            ->create(['plu' => '10101001001000000']);

        /*
         * The fixed code, and the two locks that keep it out of production, are
         * proved by `test_a_fixed_sign_in_code_cannot_exist_in_production`
         * below. Here it is simply switched on, which is what a browser run
         * does through `OTP_TEST_CODE` — the alternative was a test that parses
         * `storage/logs/laravel.log`, which does not work in CI at all.
         */
        config([
            'auth.otp.test_code' => self::TEST_CODE,
            'services.payments.sandbox.enabled' => true,
            'services.payments.payme.enabled' => false,
            'services.payments.click.enabled' => false,
            'services.payments.uzum.enabled' => false,
        ]);

        $this->gateway = new class implements SmsSender
        {
            /** @var list<array{phone: string, text: string}> */
            public array $sent = [];

            public function send(string $phone, string $text): SmsDelivery
            {
                $this->sent[] = ['phone' => $phone, 'text' => $text];

                return SmsDelivery::accepted('test-'.count($this->sent));
            }
        };

        $this->app->instance(SmsSender::class, $this->gateway);
    }

    // ============ The whole chain ============

    public function test_a_guest_signs_in_orders_pays_online_and_the_kitchen_cooks_it(): void
    {
        // ---------------------------------------------------------------
        // 1. The SMS door. A phone number, a code, a token.
        // ---------------------------------------------------------------
        $this->guest('POST', '/api/v1/public/auth/otp', ['phone' => self::PHONE])
            ->assertCreated();

        $this->assertNotSame([], $this->gateway->sent, 'No SMS reached the gateway.');

        $signedIn = $this->guest('POST', '/api/v1/public/auth/otp/verify', [
            'phone' => self::PHONE,
            'code' => self::TEST_CODE,
            'name' => 'Dilnoza Aliyeva',
        ])->assertCreated();

        $token = (string) $signedIn->json('token');
        $this->assertNotSame('', $token);

        $customer = Customer::query()->where('phone', self::PHONE)->firstOrFail();

        // ---------------------------------------------------------------
        // 2. A campaign the guest is about to spend.
        // ---------------------------------------------------------------
        PromoCode::factory()->percent(15)->create(['code' => 'OSH15', 'max_uses' => 50]);

        // The cart's own check, which is what the promo field calls as it is
        // typed. It writes nothing — the budget must not fall by one per
        // keystroke — so the campaign is still untouched after it.
        $this->guest('POST', '/api/v1/public/promo-codes/check', [
            'code' => 'osh15',
            'subtotal_tiyin' => self::OSH * 2,
        ], $token)->assertOk()->assertJsonPath('data.discount_tiyin', intdiv(self::OSH * 2 * 15, 100));

        $this->assertSame(0, (int) PromoCode::query()->where('code', 'OSH15')->value('used_count'));

        // ---------------------------------------------------------------
        // 3. The order. Paid online, so nothing may be cooked yet.
        // ---------------------------------------------------------------
        $placed = $this->guest('POST', '/api/v1/public/orders', [
            'channel' => 'delivery',
            'branch_id' => $this->branch->id,
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 2]],
            'customer' => ['name' => 'Dilnoza Aliyeva', 'phone' => self::PHONE],
            'address' => ['line' => 'Chilonzor 9, 41-uy'],
            'promo_code' => 'osh15',
            'payment_method' => 'online',
            'source' => 'app',
        ], $token)->assertCreated();

        $number = (string) $placed->json('data.number');
        $discount = intdiv(self::OSH * 2 * 15, 100);

        // The discount is the SERVER's. Asserted against the arithmetic rather
        // than a literal, so a change to `discountFor()` fails here.
        $placed->assertJsonPath('data.discount_total', $discount);
        $placed->assertJsonPath('data.promo.code', 'OSH15');
        $placed->assertJsonPath('data.promo.discount_tiyin', $discount);

        $order = Order::query()->withoutGlobalScope('branch')->where('number', $number)->firstOrFail();

        $this->assertSame($discount, (int) $order->discount_total, 'The browser priced the promo, not the server.');
        $this->assertSame((int) $customer->getKey(), (int) $order->customer_id, 'The bill did not land on the guest.');
        $this->assertSame('draft', $order->status);
        $this->assertSame('pending', $order->payment_state);

        // The campaign has been spent exactly once, in the same transaction the
        // discount was written in.
        $this->assertSame(1, (int) PromoCode::query()->where('code', 'OSH15')->value('used_count'));
        $this->assertSame(1, PromoRedemption::query()->where('order_id', $order->getKey())->count());

        // And the kitchen has NOTHING. This is the assertion the whole
        // `payment_state` axis exists for: a kitchen that cooks before the
        // money lands pays for every abandoned checkout.
        $this->assertSame([], $this->dockets(), 'An unpaid online order reached a pass.');

        // ---------------------------------------------------------------
        // 4. The money. Sandbox settles on the spot.
        // ---------------------------------------------------------------
        $invoice = $this->guest('POST', '/api/v1/public/payments/invoice', [
            'order_id' => $order->getKey(),
            'order_number' => $number,
            'provider' => 'sandbox',
        ], $token)->assertCreated();

        $this->assertSame(
            PaymentResult::PAID,
            (string) PaymentInvoice::query()->where('token', (string) $invoice->json('data.invoice_id'))->value('state'),
        );

        // ---------------------------------------------------------------
        // 5. Which is what fires it. The seam that was broken.
        // ---------------------------------------------------------------
        $order->refresh();

        $this->assertSame('paid', $order->payment_state);
        $this->assertSame(
            'placed',
            $order->status,
            'Money arrived and the bill was never fired — see OnlinePaymentLedger::closeBillBehind().',
        );

        $dockets = $this->dockets();
        $this->assertNotSame([], $dockets, 'The kitchen never got a docket for a paid order.');
        $this->assertSame($number, $dockets[0]['order_number'] ?? null);

        // ---------------------------------------------------------------
        // 6. The guest watches it, and finds it in their own history.
        // ---------------------------------------------------------------
        $this->guest('GET', "/api/v1/public/orders/{$number}?phone=4567")
            ->assertOk()
            ->assertJsonPath('data.number', $number)
            ->assertJsonPath('data.payment.state', 'paid')
            ->assertJsonPath('data.status', 'placed');

        $this->guest('GET', '/api/v1/public/orders', [], $token)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.number', $number);

        // ---------------------------------------------------------------
        // 7. A cashier closes the day on it.
        // ---------------------------------------------------------------
        $manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $manager->assignRole('branch-manager');

        /*
         * Rung by rung, because the ladder refuses shortcuts and that refusal
         * is the point: `placed → handed` would be a courier reporting a
         * delivery for food no kitchen ever cooked. See OrderState::allowedNext.
         */
        foreach (['cooking', 'ready', 'enroute', 'handed'] as $rung) {
            $this->actingAs($manager)
                ->json('POST', "/api/v1/orders/orders/{$order->getKey()}/status", ['status' => $rung], [
                    'X-Tenant' => $this->tenant->slug,
                    'X-Branch' => (string) $this->branch->slug,
                ])
                ->assertOk();
        }

        $this->signOut();

        $this->assertSame('handed', $order->refresh()->status);

        // And the guest's screen has followed it the whole way: the tracking
        // ladder for a delivery ends where the courier does.
        $watched = $this->guest('GET', "/api/v1/public/orders/{$number}?phone=4567")->assertOk();

        $this->assertSame('handed', $watched->json('data.status'));
        $this->assertSame(
            $watched->json('data.stage'),
            count((array) $watched->json('data.ladder')) - 1,
            'The guest was left short of the last rung.',
        );
    }

    /**
     * The shape the customer app was typed against.
     *
     * Asserted as whole key sets rather than field by field, because the failure
     * this catches is a REMOVAL: a key quietly dropped from a payload is a
     * screen that renders `undefined` where a total was, and TypeScript cannot
     * see it — the types on the browser side are hand-written declarations of
     * what this endpoint promises, not something generated from it.
     *
     * `id` is on the placement and deliberately not on the tracking answer:
     * `POST /public/payments/invoice` needs the id AND the number to name the
     * same bill, while a screen drawing a progress bar has no use for one.
     */
    public function test_the_placement_and_tracking_payloads_keep_their_shape(): void
    {
        $token = $this->signIn();
        $placed = $this->order([], $token)->assertCreated();

        $this->assertSame(
            ['id', 'number', 'status', 'channel', 'is_open', 'branch', 'payment', 'subtotal',
                'discount_total', 'service_charge', 'delivery_fee', 'vat_included', 'total',
                'currency', 'promo', 'eta_minutes', 'promised_at', 'placed_at', 'lines'],
            array_keys((array) $placed->json('data')),
        );

        $tracked = $this->guest('GET', '/api/v1/public/orders/'.$placed->json('data.number').'?phone=4567')
            ->assertOk();

        $this->assertSame(
            /*
             * `id` leads, and only on this response.
             *
             * It is what "pay again" needs after a card is declined:
             * `POST /public/payments/invoice` is keyed by `order_id` AND
             * `order_number` together, and a tracking screen holding only the
             * number would have to send the guest back to a checkout that no
             * longer has their basket. Reaching this payload already needs the
             * bill number and the phone's last four digits, so the id goes to
             * somebody who has proved the order is theirs — which is why the
             * history list, a different credential, does not carry it.
             */
            ['id', 'number', 'status', 'channel', 'is_open', 'branch', 'stage', 'ladder', 'reached_at',
                'payment', 'eta_minutes', 'promised_at', 'placed_at', 'closed_at', 'courier',
                'delivery', 'subtotal', 'discount_total', 'service_charge', 'delivery_fee',
                'vat_included', 'total', 'currency', 'lines'],
            array_keys((array) $tracked->json('data')),
        );

        // The line's own keys, and `title` above all: it is the snapshot the
        // tracking screen names a dish by when the catalogue no longer contains
        // it, which is what happens to every withdrawn dish that was ever sold.
        $this->assertSame(
            ['id', 'menu_item_id', 'title', 'quantity', 'unit_price', 'total_price', 'status', 'note'],
            array_keys((array) $tracked->json('data.lines.0')),
        );
    }

    // ============ The two guards worth their own test ============

    public function test_a_fixed_sign_in_code_cannot_exist_in_production(): void
    {
        /*
         * The way this leaks is an operator copying a developer's `.env` onto a
         * server, so the environment check is not configurable and this test is
         * the lock on it. If it ever fails, every customer account on the
         * platform is one guessable string away from being taken.
         */
        $this->app->detectEnvironment(static fn (): string => 'production');

        $this->guest('POST', '/api/v1/public/auth/otp', ['phone' => self::PHONE])->assertCreated();

        $this->guest('POST', '/api/v1/public/auth/otp/verify', [
            'phone' => self::PHONE,
            'code' => self::TEST_CODE,
        ])->assertApiError('crm.otp_wrong');
    }

    public function test_a_promo_code_is_spent_once_however_many_dinners_are_ordered(): void
    {
        $token = $this->signIn();
        PromoCode::factory()->percent(15)->create([
            'code' => 'ONCE', 'per_customer_limit' => 1, 'max_uses' => 50,
        ]);

        $first = $this->order(['promo_code' => 'ONCE'], $token)->assertCreated();
        $second = $this->order(['promo_code' => 'ONCE'], $token)->assertCreated();

        $discount = intdiv(self::OSH * 2 * 15, 100);

        $this->assertSame($discount, (int) $first->json('data.discount_total'));

        /*
         * The second dinner pays full price and is still taken.
         *
         * Refusing the order would be the wrong direction: the guest wanted
         * food, the campaign is the restaurant's business, and a checkout that
         * 422s because a coupon ran out is a lost sale. The response says what
         * was actually charged — `promo` is null — so no screen can claim a
         * discount that did not happen.
         */
        $this->assertSame(0, (int) $second->json('data.discount_total'));
        $this->assertNull($second->json('data.promo'));

        $this->assertSame(1, (int) PromoCode::query()->where('code', 'ONCE')->value('used_count'));
    }

    public function test_another_guests_history_is_not_reachable_with_your_own_token(): void
    {
        $mine = $this->signIn();
        $this->order([], $mine)->assertCreated();

        $theirs = $this->signIn('+998907654321');

        $this->guest('GET', '/api/v1/public/orders', [], $theirs)
            ->assertOk()
            ->assertJsonCount(0, 'data');

        // And with no token at all it is not a shorter list, it is a refusal.
        $this->guest('GET', '/api/v1/public/orders')->assertApiError('order.sign_in_required');
    }

    // ============ Helpers ============

    /**
     * @param array<string, mixed> $body
     */
    private function guest(string $method, string $uri, array $body = [], ?string $token = null): TestResponse
    {
        /*
         * Per request, never `withHeaders()`.
         *
         * `withHeaders()` merges into the test's DEFAULT headers and they stick
         * for the rest of the method. On a journey test that alternates between
         * a signed-in guest, an anonymous one and a chef, a leftover
         * `Authorization` is a test that passes for the wrong reason — and the
         * "no token means refused" case passes as 200 without anybody noticing.
         */
        $headers = ['X-Tenant' => $this->tenant->slug];

        if ($token !== null) {
            $headers['Authorization'] = 'Bearer '.$token;
        }

        return $this->json($method, $uri, $body, $headers);
    }

    private function signIn(string $phone = self::PHONE): string
    {
        $this->guest('POST', '/api/v1/public/auth/otp', ['phone' => $phone])->assertCreated();

        return (string) $this->guest('POST', '/api/v1/public/auth/otp/verify', [
            'phone' => $phone,
            'code' => self::TEST_CODE,
            'name' => 'Dilnoza Aliyeva',
        ])->assertCreated()->json('token');
    }

    /**
     * @param array<string, mixed> $over
     */
    private function order(array $over = [], ?string $token = null): TestResponse
    {
        return $this->guest('POST', '/api/v1/public/orders', [
            'channel' => 'delivery',
            'branch_id' => $this->branch->id,
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 2]],
            'customer' => ['name' => 'Dilnoza Aliyeva', 'phone' => self::PHONE],
            'address' => ['line' => 'Chilonzor 9, 41-uy'],
            'payment_method' => 'cash',
            ...$over,
        ], $token);
    }

    /**
     * Put the process back to "nobody is signed in", between staff steps.
     *
     * Not tidiness — without it the rest of the journey passes for the wrong
     * reason, and it took a 500 to find out why. `auth:sanctum` ends with
     * `AuthManager::shouldUse('sanctum')`, which rewrites
     * `auth.defaults.guard` for the whole process; a test runs many requests
     * through one application instance, so the change outlives the request
     * that made it. From then on `$request->user()` on a PUBLIC route resolves
     * the guest's bearer token — and Sanctum happily hands back the `Customer`
     * behind it, which is not an `Authenticatable` and explodes inside
     * `ThrottleRequests`.
     *
     * The default is captured in `setUp()` rather than read here, because by
     * the time this runs the config has already been moved.
     */
    private function signOut(): void
    {
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse($this->defaultGuard);
    }

    /**
     * What is on the pass, read through the endpoint a KDS screen calls.
     *
     * Not through the model. Nothing in this test tells Kitchen an order
     * exists — `BillRegistry::send()` did, through `TicketWriter` — and asking
     * the table directly would still pass if the route that draws the screen
     * were broken.
     *
     * @return array<int, array<string, mixed>>
     */
    private function dockets(): array
    {
        $chef = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $chef->assignRole('chef');

        $answer = $this->actingAs($chef)
            ->json('GET', '/api/v1/kitchen/tickets', [], [
                'X-Tenant' => $this->tenant->slug,
                'X-Branch' => (string) $this->branch->slug,
            ])
            ->assertOk();

        $this->signOut();

        return (array) $answer->json('data');
    }
}
