<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Tables\Events\GuestCalled;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Modules\Tables\Models\WaiterCall;
use Tests\TestCase;

/**
 * The QR sticker on the table, exercised as a guest actually uses it.
 *
 * Everything here is anonymous. The only credential is the token printed on the
 * furniture, so the tests are grouped around what that token may and may not
 * buy:
 *
 *   **It buys food onto THIS table's bill** — joining the one already open
 *   rather than opening a second, and reaching the kitchen in the same
 *   transaction.
 *
 *   **It does not buy the next table's bill.** A token that names nothing, one
 *   from another restaurant, and a retired table all answer the same way.
 *
 *   **A raised hand is raised once.** Four impatient taps are one call and one
 *   buzz, which is what the floor screen needs to stay readable.
 *
 * The one thing deliberately not asserted is the route's throttle: a test that
 * fired eleven requests would be testing Laravel rather than this endpoint, and
 * would go flaky the day the suite runs two of these files in the same minute.
 */
final class PublicTableOrderTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    private RestaurantTable $seat;

    private MenuItem $osh;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
        $hall = Hall::factory()->create(['branch_id' => $this->branch->id]);
        $this->seat = RestaurantTable::factory()->create([
            'hall_id' => $hall->id,
            'branch_id' => $this->branch->id,
            'label' => 'A-7',
            'seats' => 4,
        ]);

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
     * @param  array<string, mixed>  $body
     */
    private function guest(string $method, string $path, array $body = [], ?string $token = null): TestResponse
    {
        $token ??= (string) $this->seat->qr_token;

        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->json($method, "/api/v1/public/tables/{$token}{$path}", $body);
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $items
     */
    private function order(?array $items = null, ?string $token = null): TestResponse
    {
        return $this->guest('POST', '/order', [
            'items' => $items ?? [['menu_item_id' => $this->osh->id, 'quantity' => 2]],
        ], $token);
    }

    // ============ Ordering from the table ============

    public function test_a_guest_at_a_table_orders_and_the_kitchen_gets_a_docket(): void
    {
        $answer = $this->order()->assertCreated();

        $this->assertSame('A-7', $answer->json('data.table.label'));
        $this->assertSame('placed', $answer->json('data.status'));
        $this->assertSame(2 * 4500000, $answer->json('data.subtotal'));

        $number = (string) $answer->json('data.number');

        // The bill landed on the table's own branch — which is what puts the
        // docket in front of the right kitchen.
        $order = Order::query()->withoutGlobalScope('branch')->where('number', $number)->firstOrFail();
        $this->assertSame($this->branch->id, $order->branch_id);
        $this->assertSame($this->seat->id, $order->restaurant_table_id);
        $this->assertSame('dine_in', $order->channel);

        // And the KDS sees it through its own endpoint. Nothing in this test
        // told Kitchen an order exists; `BillRegistry::send()` did.
        $chef = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $chef->assignRole('chef');
        $this->actingAs($chef);

        // `X-Branch` names a branch by SLUG, not by id — see ResolveBranch.
        $tickets = $this->withHeader('X-Branch', (string) $this->branch->slug)
            ->getJson('/api/v1/kitchen/tickets')->assertOk();

        $this->assertContains($number, $tickets->json('data.*.order_number'));
    }

    public function test_a_dine_in_bill_carries_the_service_charge_the_restaurant_set(): void
    {
        $this->tenant->update(['settings' => ['service_charge_percent' => 10]]);

        $answer = $this->order()->assertCreated();

        // DECISIONS Q2: ten percent, dine-in only. The delivery endpoint next
        // door asserts the other half of the same rule.
        $this->assertSame(900000, $answer->json('data.service_charge'));
    }

    public function test_a_second_order_joins_the_bill_that_is_already_open(): void
    {
        $first = $this->order()->assertCreated();
        $second = $this->order([['menu_item_id' => $this->osh->id, 'quantity' => 1]])->assertCreated();

        // The same bill, not a second cheque nobody asked to split.
        $this->assertSame($first->json('data.number'), $second->json('data.number'));
        $this->assertSame(3 * 4500000, $second->json('data.subtotal'));
        $this->assertSame(1, Order::query()->withoutGlobalScope('branch')->count());
    }

    public function test_the_seat_is_recorded_so_the_bill_can_be_split_later(): void
    {
        $answer = $this->guest('POST', '/order', [
            'seat_no' => 3,
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 1]],
        ])->assertCreated();

        $this->assertSame(3, $answer->json('data.lines.0.seat_no'));
    }

    public function test_a_dish_the_kitchen_has_run_out_of_is_refused_before_a_bill_is_opened(): void
    {
        $this->osh->update(['is_available' => false]);

        $this->order()->assertApiError('stop_list.item_unavailable', field: 'items');

        $this->assertSame(0, Order::query()->withoutGlobalScope('branch')->count());
    }

    // ============ Reading the bill ============

    public function test_a_table_with_nothing_open_answers_null_rather_than_a_failure(): void
    {
        $answer = $this->guest('GET', '/order')->assertOk();

        // A guest who has just sat down has no order yet, and that is an answer.
        $this->assertNull($answer->json('data'));
    }

    public function test_the_bill_shows_each_line_with_its_own_state(): void
    {
        $this->order()->assertCreated();

        $answer = $this->guest('GET', '/order')->assertOk();

        $this->assertSame('A-7', $answer->json('data.table.label'));
        $this->assertCount(1, $answer->json('data.lines'));
        // The LINE's state, not the bill's: a table's starters are served while
        // its mains are still cooking.
        $this->assertSame('pending', $answer->json('data.lines.0.status'));
        $this->assertSame(2, $answer->json('data.lines.0.quantity'));
    }

    // ============ Asking for a person ============

    public function test_a_raised_hand_reaches_the_floor(): void
    {
        Event::fake([GuestCalled::class]);

        $answer = $this->guest('POST', '/call', ['seat_no' => 2, 'note' => 'yana non'])
            ->assertCreated();

        $this->assertSame('waiter', $answer->json('data.kind'));
        $this->assertSame('open', $answer->json('data.status'));
        $this->assertFalse($answer->json('data.already_open'));

        Event::assertDispatched(GuestCalled::class, function (GuestCalled $event): bool {
            return $event->call->restaurant_table_id === $this->seat->id
                && $event->broadcastOn()[0]->name === 'private-branch.'.$this->branch->id.'.floor';
        });
    }

    public function test_four_impatient_taps_are_one_call_and_one_buzz(): void
    {
        Event::fake([GuestCalled::class]);

        $first = $this->guest('POST', '/call')->assertCreated();

        for ($i = 0; $i < 3; $i++) {
            $again = $this->guest('POST', '/call')->assertOk();

            $this->assertSame($first->json('data.id'), $again->json('data.id'));
            $this->assertTrue($again->json('data.already_open'));
        }

        $this->assertSame(1, WaiterCall::query()->withoutGlobalScope('branch')->count());
        // One buzz. A handset that rang four times for one table is a handset
        // people learn to ignore.
        Event::assertDispatchedTimes(GuestCalled::class, 1);
    }

    // ============ Asking to pay ============

    public function test_asking_for_the_bill_signals_the_floor_and_moves_the_bill(): void
    {
        Event::fake([GuestCalled::class]);

        $this->order()->assertCreated();

        $answer = $this->guest('POST', '/pay', [
            'method' => 'card',
            'tip_percent' => 10,
            'split_between' => 4,
        ])->assertCreated();

        $this->assertSame('bill', $answer->json('data.call.kind'));
        $this->assertSame('topay', $answer->json('data.bill.status'));

        // The guest's preference reaches the waiter as a readable line rather
        // than as columns — money lives in Finance, not here.
        $call = WaiterCall::query()->withoutGlobalScope('branch')->where('kind', 'bill')->firstOrFail();
        $this->assertStringContainsString('method=card', (string) $call->note);
        $this->assertStringContainsString('tip=10%', (string) $call->note);
        $this->assertStringContainsString('split=4', (string) $call->note);

        Event::assertDispatched(GuestCalled::class);
    }

    public function test_asking_to_pay_at_a_table_with_no_bill_is_refused(): void
    {
        $this->guest('POST', '/pay')->assertApiError('tables.no_open_bill');
    }

    public function test_asking_twice_does_not_move_the_bill_twice_or_buzz_twice(): void
    {
        Event::fake([GuestCalled::class]);

        $this->order()->assertCreated();
        $this->guest('POST', '/pay')->assertCreated();

        $again = $this->guest('POST', '/pay')->assertOk();

        $this->assertTrue($again->json('data.call.already_open'));
        $this->assertSame('topay', $again->json('data.bill.status'));
        Event::assertDispatchedTimes(GuestCalled::class, 1);
    }

    // ============ What the token may not buy ============

    public function test_a_token_that_names_nothing_is_a_404(): void
    {
        $this->order(token: 'nosuchtoken')->assertApiError('request.not_found', field: 'table');
    }

    public function test_another_restaurants_table_cannot_be_ordered_onto(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($other);
        $theirBranch = Branch::factory()->create(['tenant_id' => $other->id]);
        $theirHall = Hall::factory()->create(['branch_id' => $theirBranch->id]);
        $theirSeat = RestaurantTable::factory()->create([
            'hall_id' => $theirHall->id,
            'branch_id' => $theirBranch->id,
        ]);
        app(TenantContext::class)->set($this->tenant);

        // A real token, from a real table, presented against the wrong
        // restaurant. The tenant scope refuses it before anything is read.
        $this->order(token: (string) $theirSeat->qr_token)
            ->assertApiError('request.not_found', field: 'table');

        $this->assertSame(0, Order::query()->withoutGlobalScope('branch')->count());
    }

    public function test_a_retired_table_takes_no_orders(): void
    {
        $this->seat->update(['is_active' => false]);

        $this->order()->assertApiError('request.not_found', field: 'table');
    }

    public function test_a_write_from_the_table_still_needs_a_one_time_key(): void
    {
        /*
         * The key rides in postJson's third argument: the harness mints a fresh
         * one per request and merges it over the default headers, so one set
         * with `withHeaders` would be silently replaced.
         */
        $this->withHeader('X-Tenant', $this->tenant->slug)
            ->postJson(
                "/api/v1/public/tables/{$this->seat->qr_token}/order",
                ['items' => [['menu_item_id' => $this->osh->id, 'quantity' => 1]]],
                ['Idempotency-Key' => ''],
            )->assertApiError('request.idempotency_key_missing');
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();

        parent::tearDown();
    }
}
