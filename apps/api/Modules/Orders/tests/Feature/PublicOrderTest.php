<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Orders\BillTotals;
use App\Support\Orders\OrderChannel;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * A stranger with a phone putting food on a real kitchen's pass.
 *
 * The first end-to-end path on this platform that begins outside the building,
 * and the tests are grouped by the thing that could go wrong rather than by
 * endpoint:
 *
 *   **The chain actually joins up.** Order → docket on the KDS → cashier
 *   settles. Three modules, no shared class between them, and the one test in
 *   here that would notice if any link were cut.
 *
 *   **Money is the server's.** Every total is asserted against
 *   `BillTotals::of()` rather than against a number typed into the test, so the
 *   two cannot drift and a change to the VAT rule fails here.
 *
 *   **A guest cannot reach past their own order.** Another restaurant's, and
 *   another person's — the second one only needs a bill number, which is
 *   sequential.
 */
final class PublicOrderTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    private MenuItem $osh;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->osh = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 4500000)->create();
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /**
     * @param  array<string, mixed>  $over
     */
    private function place(array $over = [], ?Tenant $as = null): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => ($as ?? $this->tenant)->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/public/orders', [
            'channel' => 'delivery',
            'branch_id' => $this->branch->id,
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 2]],
            'customer' => ['name' => 'Dilnoza Aliyeva', 'phone' => '+998 90 123 45 67'],
            'address' => ['line' => 'Chilonzor 9, 41-uy'],
            'payment_method' => 'cash',
            ...$over,
        ]);
    }

    private function track(string $number, string $phone = '4567'): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->getJson("/api/v1/public/orders/{$number}?phone={$phone}");
    }

    // ============ The whole chain ============

    public function test_a_guest_orders_the_kitchen_sees_it_and_a_cashier_closes_it(): void
    {
        $answer = $this->place()->assertCreated();

        $number = (string) $answer->json('data.number');

        // 1. The bill exists, is fired, and belongs to the branch the guest picked.
        $order = Order::query()->withoutGlobalScope('branch')->where('number', $number)->firstOrFail();
        $this->assertSame('placed', $order->status);
        $this->assertSame($this->branch->id, $order->branch_id);
        $this->assertSame('delivery', $order->channel);

        // 2. The kitchen has a docket for it, through its own endpoint — the one
        //    a KDS screen actually calls. Nothing in this test tells Kitchen an
        //    order exists; `BillRegistry::send()` did, through TicketWriter.
        $chef = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $chef->assignRole('chef');
        $this->actingAs($chef);

        // `X-Branch` names a branch by SLUG, not by id — see ResolveBranch.
        $tickets = $this->withHeader('X-Branch', (string) $this->branch->slug)
            ->getJson('/api/v1/kitchen/tickets')->assertOk();

        $this->assertContains($number, $tickets->json('data.*.order_number'));

        // 3. And a cashier settles it. Through the ladder rather than by writing
        //    the column, so a bill that could not legally be paid fails here.
        $this->assertTrue($order->transitionTo('paid'));
        $this->assertSame('paid', $order->refresh()->status);
    }

    public function test_a_guest_with_no_account_gets_a_number_and_an_eta(): void
    {
        $answer = $this->place()->assertCreated();

        $this->assertMatchesRegularExpression('/^A-\d{4}$/', (string) $answer->json('data.number'));
        $this->assertSame('placed', $answer->json('data.status'));
        $this->assertSame('cash', $answer->json('data.payment.method'));
        $this->assertSame('due', $answer->json('data.payment.state'));
        $this->assertGreaterThan(0, $answer->json('data.eta_minutes'));
        $this->assertNotNull($answer->json('data.promised_at'));
    }

    // ============ Money is the server's ============

    public function test_the_total_is_computed_from_the_catalogue_not_from_the_request(): void
    {
        $answer = $this->place([
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 2]],
        ])->assertCreated();

        /*
         * Asserted against BillTotals rather than a number typed here, so the
         * two cannot drift: a change to the VAT rule or to the service-charge
         * rule fails in this file rather than on somebody's receipt.
         *
         * Delivery, so no service charge (Q2) and the fee is zero — this branch
         * has set none.
         */
        $expected = BillTotals::of(
            subtotal: 2 * 4500000,
            channel: OrderChannel::Delivery,
        );

        $this->assertSame($expected->subtotal, $answer->json('data.subtotal'));
        $this->assertSame(0, $answer->json('data.service_charge'));
        $this->assertSame($expected->vat, $answer->json('data.vat_included'));
        $this->assertSame($expected->total, $answer->json('data.total'));
    }

    public function test_a_delivery_fee_comes_off_the_branch_and_stops_at_the_free_threshold(): void
    {
        $this->branch->update(['settings' => [
            'delivery_fee_tiyin' => 1500000,
            'free_delivery_over_tiyin' => 10000000,
        ]]);

        // 45 000 — under the threshold, so the fee applies.
        $one = $this->place(['items' => [['menu_item_id' => $this->osh->id, 'quantity' => 1]]])
            ->assertCreated();
        $this->assertSame(1500000, $one->json('data.delivery_fee'));
        $this->assertSame(4500000 + 1500000, $one->json('data.total'));

        // 135 000 — over it, so it does not.
        $three = $this->place([
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 3]],
            'customer' => ['name' => 'Botir', 'phone' => '+998901112233'],
        ])->assertCreated();
        $this->assertSame(0, $three->json('data.delivery_fee'));
    }

    public function test_a_pickup_order_is_taken_but_carries_no_delivery_fee(): void
    {
        $this->branch->update(['settings' => ['delivery_fee_tiyin' => 1500000]]);

        $answer = $this->place(['channel' => 'pickup', 'address' => []])->assertCreated();

        // The guest's word is `pickup`; the column has always stored `takeaway`.
        $this->assertSame('takeaway', $answer->json('data.channel'));
        $this->assertSame(0, $answer->json('data.delivery_fee'));
        // Service charge is dine-in only — DECISIONS Q2.
        $this->assertSame(0, $answer->json('data.service_charge'));
    }

    public function test_a_basket_below_the_branch_minimum_is_refused_and_writes_nothing(): void
    {
        $this->branch->update(['settings' => ['min_order_tiyin' => 10000000]]);

        $this->place(['items' => [['menu_item_id' => $this->osh->id, 'quantity' => 1]]])
            ->assertApiError('order.below_minimum');

        // Rolled back whole: a refused order must not leave a bill behind for
        // somebody to find open the next morning.
        $this->assertSame(0, Order::query()->withoutGlobalScope('branch')->count());
    }

    // ============ What the kitchen cannot cook ============

    public function test_a_dish_the_kitchen_has_run_out_of_is_refused_by_name(): void
    {
        $this->osh->update(['is_available' => false]);

        $answer = $this->place()->assertApiError('stop_list.item_unavailable', field: 'items');

        $this->assertSame($this->osh->id, $answer->json('error.menu_item_id'));

        /*
         * The refusal names the dish rather than reciting the catalogue's
         * generic sentence — asserted against the catalogue rather than against
         * a word, because the title comes back resolved for the request's
         * locale and this request named none.
         */
        $this->assertNotSame(
            ErrorCatalogue::get('stop_list.item_unavailable')->uz,
            $answer->json('error.message_uz'),
        );
        $this->assertSame(0, Order::query()->withoutGlobalScope('branch')->count());
    }

    public function test_a_dish_from_another_restaurant_is_simply_not_on_the_menu(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($other);
        $theirs = MenuItem::factory()->create();
        app(TenantContext::class)->set($this->tenant);

        $this->place(['items' => [['menu_item_id' => $theirs->id, 'quantity' => 1]]])
            ->assertApiError('order.item_not_found');
    }

    // ============ Online payment does not reach the kitchen ============

    public function test_an_order_paid_online_waits_for_the_money_before_it_is_cooked(): void
    {
        $answer = $this->place(['payment_method' => 'online'])->assertCreated();

        $this->assertSame('pending', $answer->json('data.payment.state'));
        // Never fired: no `placed`, so no docket, so no station.
        $this->assertSame('draft', $answer->json('data.status'));
        $this->assertNull($answer->json('data.placed_at'));

        $order = Order::query()->withoutGlobalScope('branch')
            ->where('number', $answer->json('data.number'))->firstOrFail();
        $this->assertSame('draft', $order->status);
    }

    // ============ The belts ============

    public function test_one_number_may_not_have_a_fourth_order_running(): void
    {
        $this->place()->assertCreated();
        $this->place()->assertCreated();
        $this->place()->assertCreated();

        $this->place()->assertApiError('order.too_many_open', field: 'customer.phone');

        // A different number is unaffected — the ceiling is per guest, not per
        // restaurant.
        $this->place(['customer' => ['name' => 'Botir', 'phone' => '+998907776655']])
            ->assertCreated();
    }

    public function test_the_same_number_written_four_ways_is_one_guest(): void
    {
        $this->place(['customer' => ['name' => 'Anvar', 'phone' => '+998 90 123 45 67']])->assertCreated();
        $this->place(['customer' => ['name' => 'Anvar', 'phone' => '998901234567']])->assertCreated();
        $this->place(['customer' => ['name' => 'Anvar', 'phone' => '+998-90-123-45-67']])->assertCreated();

        $this->place(['customer' => ['name' => 'Anvar', 'phone' => '(998) 90 123 45 67']])
            ->assertApiError('order.too_many_open');
    }

    public function test_a_branch_of_another_restaurant_cannot_be_ordered_from(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($other);
        $theirs = Branch::factory()->create(['tenant_id' => $other->id]);
        app(TenantContext::class)->set($this->tenant);

        $this->place(['branch_id' => $theirs->id])
            ->assertApiError('order.branch_unavailable', field: 'branch_id');
    }

    public function test_a_suspended_branch_takes_no_orders(): void
    {
        $this->branch->update(['status' => 'suspended']);

        $this->place()->assertApiError('order.branch_unavailable');
    }

    public function test_a_one_venue_restaurant_need_not_name_its_venue(): void
    {
        // Most restaurants have one address, and there is no public endpoint
        // that would tell a guest app its id — see `branchOrFail()`.
        $answer = $this->place(['branch_id' => null])->assertCreated();

        $this->assertSame($this->branch->id, $answer->json('data.branch.id'));
    }

    public function test_a_chain_refuses_to_guess_which_kitchen(): void
    {
        Branch::factory()->create(['tenant_id' => $this->tenant->id]);

        $answer = $this->place(['branch_id' => null])
            ->assertApiError('order.branch_unavailable', field: 'branch_id');

        $this->assertSame(2, $answer->json('error.venues'));
    }

    public function test_a_repeated_tap_on_a_slow_connection_orders_one_dinner(): void
    {
        $key = 'guest-order-once';

        /*
         * The key rides in postJson's third argument rather than in
         * `withHeaders`. The harness mints a fresh one per request and merges
         * it over the default headers, so a key set with `withHeaders` is
         * silently replaced — which is exactly the thing this test is about.
         */
        $first = $this->withHeader('X-Tenant', $this->tenant->slug)
            ->postJson('/api/v1/public/orders', $this->body(), ['Idempotency-Key' => $key])
            ->assertCreated();

        $second = $this->withHeader('X-Tenant', $this->tenant->slug)
            ->postJson('/api/v1/public/orders', $this->body(), ['Idempotency-Key' => $key]);

        $second->assertHeader('Idempotent-Replay', 'true');
        $this->assertSame($first->json('data.number'), $second->json('data.number'));
        $this->assertSame(1, Order::query()->withoutGlobalScope('branch')->count());
    }

    public function test_an_order_without_a_key_is_refused(): void
    {
        $this->withHeader('X-Tenant', $this->tenant->slug)
            ->postJson('/api/v1/public/orders', $this->body(), ['Idempotency-Key' => ''])
            ->assertApiError('request.idempotency_key_missing');
    }

    public function test_ten_a_minute_and_then_the_door_shuts(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');

        // The eleventh in the same minute is refused. The counter is per address
        // and the placement above spent one of it.
        for ($i = 0; $i < 9; $i++) {
            $this->track($number)->assertOk();
        }

        $this->track($number)->assertApiError('request.rate_limited');
    }

    // ============ Validation ============

    public function test_an_empty_basket_and_a_missing_address_are_both_refused(): void
    {
        $this->place(['items' => []])->assertApiValidationErrors(['items']);
        $this->place(['address' => []])->assertApiValidationErrors(['address.line']);
        $this->place(['channel' => 'dine_in'])->assertApiValidationErrors(['channel']);
        $this->place(['payment_method' => 'crypto'])->assertApiValidationErrors(['payment_method']);
    }

    public function test_a_promo_code_is_recorded_and_moves_no_money(): void
    {
        $answer = $this->place(['promo_code' => 'YANGIYIL'])->assertCreated();

        // Nothing came off. There is no promotions module, so nothing can say
        // what a code is worth — see the migration.
        $this->assertSame(0, $answer->json('data.discount_total'));

        $order = Order::query()->withoutGlobalScope('branch')
            ->where('number', $answer->json('data.number'))->firstOrFail();
        $this->assertSame('YANGIYIL', $order->promo_code);
    }

    // ============ Tracking ============

    public function test_tracking_answers_the_ladder_the_channel_actually_has(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');

        $answer = $this->track($number)->assertOk();

        $this->assertSame('placed', $answer->json('data.status'));
        $this->assertSame(0, $answer->json('data.stage'));
        // A delivery never reaches `served`, and it does reach `enroute`.
        $this->assertSame(
            ['placed', 'accepted', 'cooking', 'ready', 'enroute', 'handed'],
            $answer->json('data.ladder'),
        );
        $this->assertNotNull($answer->json('data.reached_at.placed'));
        $this->assertNull($answer->json('data.courier'));
    }

    public function test_the_timeline_grows_as_the_kitchen_moves_the_order(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');

        $order = Order::query()->withoutGlobalScope('branch')->where('number', $number)->firstOrFail();
        $order->transitionTo('accepted');
        $order->transitionTo('cooking');

        $answer = $this->track($number)->assertOk();

        $this->assertSame('cooking', $answer->json('data.status'));
        $this->assertSame(2, $answer->json('data.stage'));
        $this->assertNotNull($answer->json('data.reached_at.accepted'));
        $this->assertNotNull($answer->json('data.reached_at.cooking'));
    }

    public function test_knowing_the_number_is_not_enough_to_read_somebody_elses_dinner(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');

        // Wrong four digits, and a bill number one keystroke away, answer the
        // same way: nothing exists.
        $this->track($number, '0000')->assertApiError('request.not_found');
        $this->track('A-9999')->assertApiError('request.not_found');
    }

    public function test_a_dine_in_bill_is_not_trackable_by_a_stranger(): void
    {
        // A waiter's bill has no `customer_phone`, so there is nothing to check
        // a caller against — and saying "this exists but you cannot see it"
        // would make this endpoint a way to count a restaurant's covers.
        $bill = Order::factory()->create(['number' => 'A-7777', 'channel' => 'dine_in']);

        $this->assertNull($bill->customer_phone);
        $this->track('A-7777')->assertApiError('request.not_found');
    }

    public function test_another_restaurant_cannot_track_this_ones_order(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');
        $other = $this->restaurant('lagmon-uyi');

        $this->withHeaders(['X-Tenant' => $other->slug, 'Accept' => 'application/json'])
            ->getJson("/api/v1/public/orders/{$number}?phone=4567")
            ->assertApiError('request.not_found');
    }

    /**
     * @return array<string, mixed>
     */
    private function body(): array
    {
        return [
            'channel' => 'delivery',
            'branch_id' => $this->branch->id,
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 2]],
            'customer' => ['name' => 'Dilnoza Aliyeva', 'phone' => '+998901234567'],
            'address' => ['line' => 'Chilonzor 9, 41-uy'],
            'payment_method' => 'cash',
        ];
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();

        parent::tearDown();
    }
}
