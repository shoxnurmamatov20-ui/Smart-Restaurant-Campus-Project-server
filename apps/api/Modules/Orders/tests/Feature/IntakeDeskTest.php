<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * The operator's four columns, and the sitting a guest asked for.
 *
 * The ninth role on this platform answers a telephone and is measured on how
 * fast, and until now the order it typed could not say which conversation it
 * was, who took it, or when the guest wanted the food. Three of those are
 * columns; the fourth — telling Yandex from Wolt — was impossible because both
 * arrived as `source = 'aggregator'`.
 *
 * The pre-order half is the one with a real refusal behind it: a sitting the
 * kitchen is dark for is refused rather than accepted and rung about.
 */
final class IntakeDeskTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    private ?MenuItem $osh = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create([
            'tenant_id' => $this->tenant->id,
            'timezone' => 'Asia/Tashkent',
            'settings' => ['hours' => ['opens' => '09:00', 'closes' => '23:00']],
        ]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    // ============ The columns ============

    public function test_an_order_records_which_lane_it_came_down_and_who_took_it(): void
    {
        $operator = $this->signIn('order-operator');

        $answer = $this->postJson('/api/v1/orders/orders', [
            'number' => 'A-0001',
            'channel' => 'delivery',
            'intake_channel' => 'wolt',
            'operator_user_id' => $operator->getKey(),
        ])->assertCreated();

        $this->assertSame('wolt', $answer->json('data.intake_channel'));
        $this->assertSame($operator->getKey(), $answer->json('data.operator_user_id'));
    }

    public function test_the_three_aggregators_are_separate_lanes_rather_than_one_word(): void
    {
        $this->signIn('branch-manager');

        foreach (['yandex', 'uzum', 'wolt'] as $index => $lane) {
            $this->postJson('/api/v1/orders/orders', [
                // `number` is required by this endpoint — see OrderFlowTest.
                'number' => sprintf('A-%04d', $index + 1),
                'channel' => 'delivery',
                'intake_channel' => $lane,
            ])->assertCreated();
        }

        // Each is billable on its own, which is the whole reason the column
        // exists: three contracts, three commissions, one word between them.
        foreach (['yandex', 'uzum', 'wolt'] as $lane) {
            $found = $this->getJson('/api/v1/orders/orders?filter[intake_channel]='.$lane)->assertOk();

            $this->assertCount(1, $found->json('data'));
            $this->assertSame($lane, $found->json('data.0.intake_channel'));
        }
    }

    public function test_a_lane_nobody_has_a_contract_with_is_refused(): void
    {
        $this->signIn('branch-manager');

        $this->postJson('/api/v1/orders/orders', [
            'number' => 'A-0001',
            'channel' => 'delivery',
            'intake_channel' => 'glovo',
        ])->assertStatus(422);
    }

    public function test_the_queue_can_name_the_guest_it_is_about(): void
    {
        $this->signIn('order-operator');

        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'channel' => 'delivery',
            'intake_channel' => 'phone',
            'customer_name' => 'Dilnoza Aliyeva',
            'customer_phone' => '998901114567',
            'delivery_address' => 'Chilonzor 9, 41-uy',
            'payment_method' => 'cash',
            'payment_state' => 'due',
        ]);

        $row = $this->getJson('/api/v1/orders/orders?filter[intake_channel]=phone')
            ->assertOk()->json('data.0');

        // The intake queue drew "a number with four blanks under it" because
        // these were columns on the bill that nothing published.
        $this->assertSame('Dilnoza Aliyeva', $row['customer_name']);
        $this->assertSame('998901114567', $row['customer_phone']);
        $this->assertSame('Chilonzor 9, 41-uy', $row['delivery']['address']);
        $this->assertSame('cash', $row['payment_method']);
        $this->assertSame('due', $row['payment_state']);
    }

    public function test_a_dine_in_ticket_is_not_in_the_intake_queue(): void
    {
        $this->signIn('order-operator');

        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'channel' => 'dine_in',
            'status' => 'placed',
        ]);
        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'channel' => 'delivery',
            'status' => 'placed',
            'intake_channel' => 'phone',
        ]);

        // `status` alone cannot separate the two — a table's first order is
        // `placed` as well — which is precisely what the lane column is for.
        $queue = $this->getJson('/api/v1/orders/orders?filter[intake_channel]=phone')
            ->assertOk()->json('data');

        $this->assertCount(1, $queue);
        $this->assertSame('delivery', $queue[0]['channel']);
    }

    public function test_the_operator_filter_answers_the_league_table(): void
    {
        $mine = $this->signIn('order-operator');
        $theirs = User::factory()->create(['tenant_id' => $this->tenant->id]);

        Order::factory()->count(2)->create([
            'tenant_id' => $this->tenant->id,
            'operator_user_id' => $mine->getKey(),
            'intake_channel' => 'phone',
        ]);
        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'operator_user_id' => $theirs->getKey(),
            'intake_channel' => 'phone',
        ]);

        $found = $this->getJson('/api/v1/orders/orders?filter[operator]='.$mine->getKey())->assertOk();

        $this->assertCount(2, $found->json('data'));
    }

    // ============ The sitting a guest asked for ============

    /**
     * @param  array<string, mixed>  $over
     */
    private function place(array $over = []): TestResponse
    {
        $dish = $this->osh ??= MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 4500000)->create();

        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/public/orders', [
            'channel' => 'delivery',
            'branch_id' => $this->branch->id,
            'items' => [['menu_item_id' => $dish->id, 'quantity' => 1]],
            'customer' => ['name' => 'Dilnoza Aliyeva', 'phone' => '+998 90 123 45 67'],
            'address' => ['line' => 'Chilonzor 9, 41-uy'],
            'payment_method' => 'cash',
            ...$over,
        ]);
    }

    /** The bill the last placement wrote. */
    private function newest(): Order
    {
        return Order::query()->latest('id')->firstOrFail();
    }

    public function test_a_guest_can_ask_for_a_sitting_inside_the_venues_own_day(): void
    {
        $at = now()->addDay()->setTime(19, 0);

        $this->place(['scheduled_for' => $at->toIso8601String()])->assertCreated();

        $order = $this->newest();
        $this->assertNotNull($order->scheduled_for);
        $this->assertSame($at->toIso8601String(), $order->scheduled_for->toIso8601String());
    }

    public function test_a_sitting_the_kitchen_is_dark_for_is_refused_rather_than_rung_about(): void
    {
        $refusal = $this->place([
            'scheduled_for' => now()->addDay()->setTime(4, 30)->toIso8601String(),
        ])->assertStatus(422);

        $this->assertSame('order.outside_hours', $refusal->json('error.code'));
        // The meta rides alongside the four fixed keys rather than inside them
        // — see ApiError::toArray() — so the chooser can redraw itself around
        // the venue's own hours rather than guessing again.
        $this->assertSame('09:00', $refusal->json('error.opens'));
        $this->assertSame('23:00', $refusal->json('error.closes'));
    }

    public function test_a_venue_that_never_filled_in_its_hours_takes_any_sitting(): void
    {
        // The safe direction to be wrong in: refusing every pre-order at a
        // restaurant that never visited a settings page is a feature that looks
        // like an outage.
        $this->branch->forceFill(['settings' => []])->save();

        $this->place([
            'scheduled_for' => now()->addDay()->setTime(4, 30)->toIso8601String(),
        ])->assertCreated();
    }

    public function test_an_order_with_no_sitting_is_asap_rather_than_now(): void
    {
        $this->place()->assertCreated();

        // Null, not `placed_at`. A column that always has a time in it cannot
        // answer "was this a pre-order", which is what the kitchen's morning
        // list is built from.
        $this->assertNull($this->newest()->scheduled_for);
    }

    public function test_the_lane_is_derived_from_the_client_rather_than_named_by_it(): void
    {
        $this->place(['source' => 'telegram'])->assertCreated();
        $this->assertSame('telegram', $this->newest()->intake_channel);

        $this->place(['source' => 'web'])->assertCreated();
        // Everything that is not the mini app is the restaurant's own front
        // door: one lane, one contract, and no client gets to bill itself as an
        // aggregator.
        $this->assertSame('site', $this->newest()->intake_channel);
    }

    // ============ Tenancy ============

    public function test_another_restaurants_orders_are_not_in_the_lane(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Order::factory()->create(['tenant_id' => $other->id, 'intake_channel' => 'wolt']);

        $this->signIn('branch-manager');

        $this->getJson('/api/v1/orders/orders?filter[intake_channel]=wolt')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
