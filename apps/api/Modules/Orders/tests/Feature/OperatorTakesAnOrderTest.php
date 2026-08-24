<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use App\Models\Branch;
use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * An order taken over the telephone, and the guest being told what happened to it.
 *
 * Two halves of the same evening, and both were holes the intake screen wrote
 * down in its own words.
 *
 * **Taking it.** `POST /orders/orders` accepted a bill with no name, no number,
 * no address and no tender on it — every one of those is a column, every one is
 * collected by the compose flow, and `validated()` dropped the lot. What
 * reached the kitchen was *"a delivery with no address, which is not a degraded
 * order — it is not an order"*. The basket could not travel either: the screen
 * had a cart and the endpoint had no `items`, so a line needed a second request
 * that could fail on its own.
 *
 * **Telling them.** Nothing notified a guest of anything, ever. Somebody who
 * ordered by telephone learned their food was coming by ringing back to ask.
 */
final class OperatorTakesAnOrderTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
    }

    private function signIn(string $role = 'order-operator'): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    private function dish(string $sku = 'OSH-1', int $price = 4_500_000): MenuItem
    {
        return MenuItem::factory()->dish($sku, 'Osh', 'Плов', 'Pilaf', $price)->create();
    }

    // ============ Taking the order ============

    public function test_an_operator_types_up_a_call_and_the_whole_order_lands(): void
    {
        $operator = $this->signIn();
        $dish = $this->dish();

        $answer = $this->postJson('/api/v1/orders/orders', [
            'channel' => 'delivery',
            'status' => 'placed',
            'source' => 'pos',
            'intake_channel' => 'phone',
            'operator_user_id' => $operator->getKey(),
            'customer_name' => 'Nilufar Karimova',
            'customer_phone' => '+998901234567',
            'delivery_address' => 'Chilonzor, Bunyodkor 41, kv. 18',
            'payment_method' => 'cash',
            'delivery_fee' => 1_500_000,
            'items' => [['menu_item_id' => $dish->id, 'quantity' => 3, 'note' => 'achchiq emas']],
        ])->assertCreated();

        // Every field the compose flow collects reaches the bill. Before this,
        // a courier was sent out with nothing to ring and nowhere to go.
        $answer->assertJsonPath('data.customer_name', 'Nilufar Karimova');
        $answer->assertJsonPath('data.customer_phone', '+998901234567');
        $answer->assertJsonPath('data.delivery.address', 'Chilonzor, Bunyodkor 41, kv. 18');
        $answer->assertJsonPath('data.payment_method', 'cash');
        $answer->assertJsonPath('data.source', 'pos');
        $answer->assertJsonPath('data.intake_channel', 'phone');

        // And the basket, in the same request. One line, three of them.
        $answer->assertJsonPath('data.items_count', 1);
        $this->assertSame(3, (int) $answer->json('data.items.0.quantity'));
        $this->assertSame('achchiq emas', $answer->json('data.items.0.note'));

        // The button says "send to the kitchen" and has to mean it. A bill
        // reading `placed` with no docket on any pass is the failure a guest
        // discovers by ringing back to ask where their food is.
        $this->assertSame(1, KitchenTicket::query()->count());
    }

    public function test_the_price_comes_from_the_catalogue_and_never_from_the_request(): void
    {
        $this->signIn();
        $dish = $this->dish(price: 4_500_000);

        $answer = $this->postJson('/api/v1/orders/orders', [
            'channel' => 'takeaway',
            'items' => [[
                'menu_item_id' => $dish->id,
                'quantity' => 2,
                // Sent and ignored: a price a client can name is a price a
                // client can name as zero.
                'unit_price' => 1,
            ]],
        ])->assertCreated();

        $this->assertSame(4_500_000, (int) $answer->json('data.items.0.unit_price'));
        $this->assertSame(9_000_000, (int) $answer->json('data.subtotal'));
    }

    public function test_a_basket_naming_a_dish_that_is_not_on_the_menu_writes_nothing(): void
    {
        $this->signIn();
        $dish = $this->dish();

        $before = Order::query()->count();

        $this->postJson('/api/v1/orders/orders', [
            'channel' => 'delivery',
            'items' => [
                ['menu_item_id' => $dish->id, 'quantity' => 1],
                ['menu_item_id' => 999_999, 'quantity' => 1],
            ],
        ])->assertApiError('order.item_not_found');

        // Both or neither. A half-order on a pass is a guest expecting the
        // whole thing and a kitchen cooking two thirds of it.
        $this->assertSame($before, Order::query()->count());
    }

    public function test_a_phone_number_that_is_not_one_is_refused_at_the_door(): void
    {
        $this->signIn();

        $this->postJson('/api/v1/orders/orders', [
            'channel' => 'delivery',
            'customer_phone' => '12',
        ])->assertApiValidationErrors('customer_phone');
    }

    public function test_the_bookkeeper_may_not_open_a_bill_at_all(): void
    {
        $this->signIn('accountant');

        /*
         * `orders.create` is the gate. A WAITER holds it — opening a bill is
         * what a waiter does all evening, and the intake desk is the same verb
         * asked from a different desk — but an accountant holds no `orders.*`
         * permission whatsoever, which is the denial `DesignRoleMatrixTest`
         * spells out and the one worth asserting here.
         */
        $this->postJson('/api/v1/orders/orders', ['channel' => 'delivery'])->assertStatus(403);
    }

    // ============ The queue that reads them back ============

    public function test_the_intake_filter_separates_the_queue_from_the_room(): void
    {
        $this->signIn('branch-manager');

        Order::factory()->create(['intake_channel' => 'phone', 'status' => 'placed']);
        Order::factory()->create(['intake_channel' => 'telegram', 'status' => 'placed']);
        // A table's first order is `placed` too, which is precisely why `status`
        // could never answer this and the intake screen sat on fixtures.
        Order::factory()->create(['intake_channel' => null, 'status' => 'placed']);

        $this->getJson('/api/v1/orders/orders?filter[intake]=true')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // And the mirror, which is "the room" — what a floor report wants.
        $this->getJson('/api/v1/orders/orders?filter[intake]=false')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    // ============ Telling the guest ============

    public function test_the_guest_is_texted_when_their_order_is_accepted(): void
    {
        $this->signIn();
        $sms = $this->recordingSms();

        $order = Order::factory()->create([
            'branch_id' => $this->branch->id,
            'intake_channel' => 'phone',
            'status' => 'placed',
            'customer_phone' => '+998901234567',
            'number' => 'A-0041',
        ]);

        $order->transitionTo('accepted');
        $this->artisan('events:relay')->assertSuccessful();

        $this->assertCount(1, $sms->sent);
        // The bill number leads: it is what a guest reads back down the line.
        $this->assertStringContainsString('A-0041', $sms->sent[0]['text']);
        $this->assertSame('+998901234567', $sms->sent[0]['phone']);
    }

    public function test_a_bill_that_started_at_a_table_texts_nobody(): void
    {
        $this->signIn();
        $sms = $this->recordingSms();

        // No `intake_channel`, so this is somebody sitting in the room. The
        // waiter is carrying the food; a text would be noise.
        $order = Order::factory()->create([
            'branch_id' => $this->branch->id,
            'intake_channel' => null,
            'status' => 'placed',
            'customer_phone' => '+998901234567',
        ]);

        $order->transitionTo('accepted');
        $this->artisan('events:relay')->assertSuccessful();

        $this->assertSame([], $sms->sent);
    }

    public function test_a_decline_is_deliberately_silent(): void
    {
        $this->signIn();
        $sms = $this->recordingSms();

        $order = Order::factory()->create([
            'branch_id' => $this->branch->id,
            'intake_channel' => 'phone',
            'status' => 'placed',
            'customer_phone' => '+998901234567',
        ]);

        // The operator is on the telephone with the guest while they tap it. A
        // text arriving mid-sentence is a second, colder refusal.
        $order->cancel('operator_declined');
        $this->artisan('events:relay')->assertSuccessful();

        $this->assertSame([], $sms->sent);
    }

    public function test_the_same_move_replayed_does_not_text_twice(): void
    {
        $this->signIn();
        $sms = $this->recordingSms();

        $order = Order::factory()->create([
            'branch_id' => $this->branch->id,
            'intake_channel' => 'site',
            'status' => 'placed',
            'customer_phone' => '+998901234567',
        ]);

        $order->transitionTo('accepted');

        // Delivery is at-least-once and a relay may sweep up an event a crash
        // left behind. "Your order is ready" arriving twice an hour apart is
        // worse than not arriving.
        $this->artisan('events:relay')->assertSuccessful();

        // Put the row back in the queue, which is what a crash between the
        // handler and the mark-published looks like from the relay's side.
        StoredDomainEvent::query()->update(['published_at' => null, 'attempts' => 0]);

        $this->artisan('events:relay')->assertSuccessful();

        $this->assertCount(1, $sms->sent);
    }

    /** An SMS gateway that remembers rather than dials. */
    private function recordingSms(): RecordingSms
    {
        $sms = new RecordingSms;
        $this->app->instance(SmsSender::class, $sms);

        return $sms;
    }
}

/**
 * The gateway, recorded.
 *
 * `Http::fake()` would test Laravel's client; what matters here is which number
 * was chosen, what the sentence said, and how many times it went.
 */
final class RecordingSms implements SmsSender
{
    /** @var list<array{phone: string, text: string}> */
    public array $sent = [];

    public function send(string $phone, string $text): SmsDelivery
    {
        $this->sent[] = ['phone' => $phone, 'text' => $text];

        return SmsDelivery::accepted('recorded');
    }
}
