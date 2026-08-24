<?php

declare(strict_types=1);

namespace Modules\Marketplace\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Auth\OtpCredentials;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;
use Modules\Marketplace\Support\MarketOrderState;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * The whole chain, end to end: a stranger orders, a kitchen cooks, a courier
 * delivers.
 *
 * This is the test the module exists to pass. Every other file here checks one
 * joint; this one checks that the joints are connected — that an order placed
 * on a marketplace by somebody with no restaurant reaches a specific
 * restaurant's kitchen, on that restaurant's own books, with the money split
 * the way both sides were told it would be.
 */
final class MarketOrderFlowTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Store $store;

    private MenuItem $plov;

    private MenuItem $tea;

    private Consumer $consumer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        // A signed-in owner is how the fixtures get built with a tenant in
        // context; the consumer half of the test signs in separately.
        $owner = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $owner->assignRole('owner');
        $this->actingAs($owner);

        $this->plov = MenuItem::factory()->create(['sku' => 'OSH-1', 'price' => 4_400_000, 'station' => 'hot']);
        $this->tea = MenuItem::factory()->create(['sku' => 'CHY-1', 'price' => 800_000, 'station' => 'bar']);

        $this->store = Store::factory()->create([
            'tenant_id' => $this->tenant->id,
            'slug' => 'osh-xona',
            'delivery_fee_tiyin' => 1_200_000,
            'commission_percent' => 9,
        ]);

        // Both dishes on the market, plov three thousand dearer than the room.
        StoreItem::create(['store_id' => $this->store->id, 'menu_item_id' => $this->plov->id, 'markup_tiyin' => 300_000]);
        StoreItem::create(['store_id' => $this->store->id, 'menu_item_id' => $this->tea->id, 'markup_tiyin' => 0]);

        $this->consumer = Consumer::factory()->create();
    }

    /**
     * A signed-in marketplace customer, as the app would be.
     *
     * Both contexts the fixtures left behind are cleared first, and that is not
     * housekeeping — it is the difference between testing the endpoint and
     * testing the test. A console session would make `$request->user()` answer
     * the owner rather than the customer, and a leftover TenantContext would put
     * a `where tenant_id` on the very reads that have to cross restaurants.
     * A real marketplace request carries neither.
     */
    private function asConsumer(?Consumer $consumer = null): Consumer
    {
        $consumer ??= $this->consumer;

        $this->app['auth']->forgetGuards();
        app(TenantContext::class)->clear();
        app(BranchContext::class)->clear();

        $this->withHeader(
            'Authorization',
            'Bearer '.$consumer->createToken('test', [Consumer::ABILITY])->plainTextToken,
        );

        return $consumer;
    }

    /** Nobody at all — a stranger with a browser. */
    private function asStranger(): void
    {
        $this->app['auth']->forgetGuards();
        app(TenantContext::class)->clear();
        app(BranchContext::class)->clear();
        $this->withHeader('Authorization', '');
    }

    private function actingAsMerchant(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /**
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    private function basket(array $overrides = []): array
    {
        return [
            'store' => 'osh-xona',
            'lines' => [
                ['menu_item_id' => $this->plov->id, 'quantity' => 2],
                ['menu_item_id' => $this->tea->id, 'quantity' => 3],
            ],
            'address' => 'Chilonzor 24, 47-xonadon',
            'pay_rail' => 'click',
            ...$overrides,
        ];
    }

    // ============ The chain ============

    public function test_an_order_travels_from_a_stranger_to_a_kitchen_and_out_again(): void
    {
        $this->asConsumer();

        // --- 1. A guest with no restaurant places an order.
        $placed = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated();

        $number = $placed->json('data.number');
        $this->assertIsString($number);
        $this->assertSame('placed', $placed->json('data.state'));
        $this->assertSame('placed', $placed->json('data.rung'));

        /*
         * Priced by the server, at market prices.
         *
         *   plov  (4 400 000 + 300 000) × 2 = 9 400 000
         *   tea   (800 000 + 0)         × 3 = 2 400 000
         *   subtotal                        = 11 800 000
         *   service 3%                      =    354 000
         *   delivery                        =  1 200 000
         *   total                           = 13 354 000
         */
        $this->assertSame(11_800_000, $placed->json('data.subtotal_tiyin'));
        $this->assertSame(354_000, $placed->json('data.service_fee_tiyin'));
        $this->assertSame(1_200_000, $placed->json('data.delivery_fee_tiyin'));
        $this->assertSame(13_354_000, $placed->json('data.total_tiyin'));

        // The commission is the merchant's business and never reaches the guest.
        $this->assertArrayNotHasKey('commission_tiyin', (array) $placed->json('data'));

        // --- 2. It appears in the merchant's ninety-second queue.
        $this->actingAsMerchant();

        $queue = $this->getJson('/api/v1/marketplace/orders?status=new')->assertOk();
        $this->assertCount(1, $queue->json('data'));
        $this->assertSame($number, $queue->json('data.0.number'));
        $this->assertNotNull($queue->json('data.0.seconds_to_answer'));

        // 9% of the food, and the restaurant is owed the rest.
        $this->assertSame(1_062_000, $queue->json('data.0.commission_tiyin'));
        $this->assertSame(10_738_000, $queue->json('data.0.merchant_due_tiyin'));

        // Nothing has reached the kitchen yet — that is what the ninety seconds are.
        $this->assertNull($queue->json('data.0.bill_id'));
        $this->assertSame(0, Order::query()->count());

        // --- 3. The merchant accepts, and the restaurant hears about it.
        $order = MarketOrder::query()->where('number', $number)->firstOrFail();

        $accepted = $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => 'accepted'])->assertOk();

        $this->assertSame('accepted', $accepted->json('data.state'));
        $billId = $accepted->json('data.bill_id');
        $this->assertIsInt($billId);

        // A real bill, on the aggregator channel, in the restaurant's own books.
        $bill = Order::query()->findOrFail($billId);
        $this->assertSame('aggregator', $bill->channel);
        $this->assertSame($this->tenant->id, $bill->tenant_id);
        $this->assertSame(11_800_000, $bill->subtotal);

        /*
         * And a docket on every station the order touches. Two dishes, two
         * stations, so two tickets — grouped the way a kitchen is laid out,
         * which is what `TicketWriter` promises.
         */
        $tickets = KitchenTicket::query()->get();
        $this->assertCount(2, $tickets);
        $this->assertEqualsCanonicalizing(
            ['hot', 'bar'],
            $tickets->map(static fn (KitchenTicket $ticket): string => $ticket->station)->all(),
        );

        // --- 4. Along the ladder and out of the door.
        foreach (['cooking', 'ready', 'courier_assigned', 'enroute', 'delivered'] as $rung) {
            $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => $rung])
                ->assertOk()
                ->assertJsonPath('data.state', $rung);
        }

        // The bill follows the food out. Paid, because the guest paid the
        // marketplace before the courier left — no tender at the till.
        $this->assertSame('paid', $bill->refresh()->status);

        // --- 5. The guest sees it delivered, and may rate it.
        $this->asConsumer();

        $tracked = $this->getJson("/api/v1/mp/orders/{$number}")->assertOk();
        $this->assertSame('delivered', $tracked->json('data.state'));
        $this->assertSame('delivered', $tracked->json('data.rung'));
        $this->assertTrue($tracked->json('data.can_rate'));
        $this->assertFalse($tracked->json('data.can_cancel'));
    }

    // ============ The ladder refuses what it should ============

    public function test_the_kitchen_never_hears_about_an_order_the_merchant_rejected(): void
    {
        $this->asConsumer();
        $number = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        $this->actingAsMerchant();
        $order = MarketOrder::query()->where('number', $number)->firstOrFail();

        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", [
            'state' => 'rejected',
            'reason' => 'Oshxona band',
        ])->assertOk()->assertJsonPath('data.state', 'rejected');

        $this->assertSame(0, Order::query()->count());
        $this->assertSame(0, KitchenTicket::query()->count());
        $this->assertSame('Oshxona band', $order->refresh()->reject_reason);
    }

    public function test_an_order_cannot_skip_the_kitchen(): void
    {
        $this->asConsumer();
        $number = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        $this->actingAsMerchant();
        $order = MarketOrder::query()->where('number', $number)->firstOrFail();

        // placed → delivered. No acceptance, no ticket, no bill — the exact
        // move that would let a restaurant be paid for food nobody cooked.
        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => 'delivered'])
            ->assertApiError('marketplace.invalid_transition');

        $this->assertSame(MarketOrderState::Placed->value, $order->refresh()->state);
    }

    public function test_a_guest_may_call_it_off_before_the_pan_is_hot_and_not_after(): void
    {
        $this->asConsumer();
        $number = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        // While it is still `placed`: allowed.
        $this->postJson("/api/v1/mp/orders/{$number}/cancel", ['reason' => 'Fikrim o\'zgardi'])
            ->assertOk()
            ->assertJsonPath('data.state', 'cancelled');

        // A second order, taken all the way to the stove.
        $second = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        $this->actingAsMerchant();
        $order = MarketOrder::query()->where('number', $second)->firstOrFail();
        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => 'accepted'])->assertOk();
        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => 'cooking'])->assertOk();

        $this->asConsumer();
        $this->postJson("/api/v1/mp/orders/{$second}/cancel")
            ->assertApiError('marketplace.too_late_to_cancel');
    }

    // ============ The promise, revised without moving the ladder ============

    /**
     * "+10 minutes" is a promise, not a rung.
     *
     * The panel's delay button used to update a number in the browser and tell
     * the merchant the guest had been informed. The guest's countdown never
     * moved, which is the entire point of the control — so it now writes
     * `eta_minutes` with no `state` beside it, and the order stays exactly where
     * it was on the ladder.
     */
    public function test_a_merchant_may_lengthen_the_promise_without_moving_the_order(): void
    {
        $this->asConsumer();
        $number = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        $this->actingAsMerchant();
        $order = MarketOrder::query()->where('number', $number)->firstOrFail();

        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => 'accepted'])->assertOk();

        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['eta_minutes' => 45])
            ->assertOk()
            ->assertJsonPath('data.eta_minutes', 45)
            // Still accepted. A revised estimate is not a move.
            ->assertJsonPath('data.state', MarketOrderState::Accepted->value);

        $this->assertSame(45, $order->fresh()?->eta_minutes);
    }

    public function test_the_promise_is_bounded_and_needs_a_body_at_all(): void
    {
        $this->asConsumer();
        $number = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        $this->actingAsMerchant();
        $order = MarketOrder::query()->where('number', $number)->firstOrFail();
        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => 'accepted'])->assertOk();

        // Past four hours the honest answer to a guest is a cancellation.
        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['eta_minutes' => 999])
            ->assertStatus(422);

        // Neither a rung nor an estimate is a call that means nothing.
        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", [])->assertStatus(422);
    }

    /**
     * Once the food has left, the estimate is the courier's.
     *
     * A kitchen quietly adding ten minutes to a delivery already on a bicycle
     * would move a promise nobody in that kitchen can keep.
     */
    public function test_the_promise_cannot_be_revised_after_the_hand_over(): void
    {
        $this->asConsumer();
        $number = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated()->json('data.number');

        $this->actingAsMerchant();
        $order = MarketOrder::query()->where('number', $number)->firstOrFail();

        foreach (['accepted', 'cooking', 'ready', 'courier_assigned'] as $rung) {
            $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['state' => $rung])->assertOk();
        }

        $this->patchJson("/api/v1/marketplace/orders/{$order->id}", ['eta_minutes' => 60])
            ->assertApiError('marketplace.invalid_transition');
    }

    // ============ The price is the server's ============

    public function test_a_basket_cannot_name_its_own_price(): void
    {
        $this->asConsumer();

        $response = $this->postJson('/api/v1/mp/orders', $this->basket([
            // Everything a client might try to talk the server into.
            'subtotal_tiyin' => 1,
            'total_tiyin' => 1,
            'delivery_fee_tiyin' => 0,
            'commission_percent' => 0,
        ]))->assertCreated();

        $this->assertSame(11_800_000, $response->json('data.subtotal_tiyin'));
        $this->assertSame(13_354_000, $response->json('data.total_tiyin'));
        $this->assertSame(1_200_000, $response->json('data.delivery_fee_tiyin'));

        $order = MarketOrder::query()->where('number', $response->json('data.number'))->firstOrFail();
        $this->assertSame(9, $order->commission_percent);
        $this->assertSame(1_062_000, $order->commission_tiyin);
    }

    public function test_a_dish_that_is_not_on_the_market_cannot_be_ordered(): void
    {
        $offMarket = MenuItem::factory()->create(['sku' => 'ROOM-ONLY', 'price' => 9_000_000]);

        $this->asConsumer();

        $this->postJson('/api/v1/mp/orders', $this->basket([
            'lines' => [['menu_item_id' => $offMarket->id, 'quantity' => 1]],
        ]))->assertApiError('marketplace.dish_unavailable');
    }

    public function test_a_closed_store_takes_no_orders(): void
    {
        $this->store->forceFill(['is_open' => false])->save();

        $this->asConsumer();

        $this->postJson('/api/v1/mp/orders', $this->basket())
            ->assertApiError('marketplace.store_closed');
    }

    // ============ Idempotency lives in the data ============

    public function test_the_same_basket_reference_twice_is_one_order(): void
    {
        $this->asConsumer();

        $body = $this->basket(['client_reference' => 'basket-8421']);

        $first = $this->postJson('/api/v1/mp/orders', $body)->assertCreated();
        $second = $this->postJson('/api/v1/mp/orders', $body)->assertCreated();

        // The same order back, not a second dinner — this is what stands in for
        // `Idempotency-Key`, which cannot work without a tenant.
        $this->assertSame($first->json('data.number'), $second->json('data.number'));
        $this->assertSame(1, MarketOrder::query()->count());
    }

    public function test_two_different_baskets_are_two_orders(): void
    {
        $this->asConsumer();

        $this->postJson('/api/v1/mp/orders', $this->basket(['client_reference' => 'basket-1']))->assertCreated();
        $this->postJson('/api/v1/mp/orders', $this->basket(['client_reference' => 'basket-2']))->assertCreated();

        $this->assertSame(2, MarketOrder::query()->count());
    }

    // ============ Plus ============

    public function test_a_plus_subscriber_pays_no_delivery_and_cannot_claim_it_without_one(): void
    {
        $subscriber = Consumer::factory()->plus()->create();
        $this->asConsumer($subscriber);

        $response = $this->postJson('/api/v1/mp/orders', $this->basket())->assertCreated();

        $this->assertSame(0, $response->json('data.delivery_fee_tiyin'));
        $this->assertSame(12_154_000, $response->json('data.total_tiyin'));

        // And somebody without a subscription cannot buy one with a request body.
        $this->asConsumer($this->consumer);

        $this->postJson('/api/v1/mp/orders', $this->basket(['plus' => true, 'client_reference' => 'x']))
            ->assertCreated()
            ->assertJsonPath('data.delivery_fee_tiyin', 1_200_000);
    }

    // ============ Rating ============

    public function test_a_delivered_order_may_be_rated_once_and_it_moves_the_shop(): void
    {
        $this->store->forceFill(['rating_tenths' => 40, 'reviews_count' => 1])->save();

        $order = MarketOrder::factory()->delivered()->create([
            'tenant_id' => $this->tenant->id,
            'store_id' => $this->store->id,
            'consumer_id' => $this->consumer->id,
        ]);

        $this->asConsumer();

        $this->postJson("/api/v1/mp/orders/{$order->number}/rate", ['rating' => 5])->assertOk();

        // (4.0 × 1 + 5.0) / 2 = 4.5
        $this->assertSame(45, $this->store->refresh()->rating_tenths);
        $this->assertSame(2, $this->store->reviews_count);

        $this->postJson("/api/v1/mp/orders/{$order->number}/rate", ['rating' => 1])
            ->assertApiError('marketplace.already_rated');
    }

    public function test_an_order_still_on_its_way_cannot_be_rated(): void
    {
        $order = MarketOrder::factory()->accepted()->create([
            'tenant_id' => $this->tenant->id,
            'store_id' => $this->store->id,
            'consumer_id' => $this->consumer->id,
        ]);

        $this->asConsumer();

        $this->postJson("/api/v1/mp/orders/{$order->number}/rate", ['rating' => 5])
            ->assertApiError('marketplace.not_delivered_yet');
    }

    // ============ Signing in ============

    public function test_a_phone_number_becomes_an_account_and_the_code_never_comes_back(): void
    {
        $this->asStranger();

        $sent = $this->postJson('/api/v1/mp/auth/otp', ['phone' => '901112233'])->assertCreated();

        // The response says how long it lives and when to ask again — and
        // nothing that could be typed into the next request.
        $body = (array) $sent->json('data');
        $this->assertArrayHasKey('expires_in', $body);
        $this->assertArrayNotHasKey('code', $body);

        $code = app(OtpCredentials::class)->issue(null, '+998901112244');
        $this->assertNotNull($code);

        $signedIn = $this->postJson('/api/v1/mp/auth/otp/verify', [
            'phone' => '901112244',
            'code' => $code['code'],
            'name' => 'Nilufar Yusupova',
        ])->assertCreated();

        $this->assertIsString($signedIn->json('token'));
        $this->assertSame('Nilufar Yusupova', $signedIn->json('data.name'));
        $this->assertSame('+998901112244', $signedIn->json('data.phone'));
    }

    public function test_a_wrong_code_buys_nothing(): void
    {
        $this->asStranger();

        app(OtpCredentials::class)->issue(null, '+998901112255');

        $this->postJson('/api/v1/mp/auth/otp/verify', ['phone' => '901112255', 'code' => '0000'])
            ->assertApiError('marketplace.otp_wrong', 'code');
    }
}
