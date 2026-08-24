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
use Modules\Orders\Models\Delivery;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * A rider's own round.
 *
 * `GET /orders/deliveries` is the dispatcher's board: everybody, everything. A
 * courier holding a phone needs the opposite — the four drops that are theirs,
 * in the order to make them, with enough of the guest to get to the door and
 * nothing else.
 *
 * The two properties worth protecting are the scoping and the disclosure. The
 * round comes from the TOKEN, so there is no id a rider could type to read
 * somebody else's evening; and what it carries is one evening's worth of one
 * person's data, on a device that gets left on a scooter seat.
 */
final class CourierRoundTest extends TestCase
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

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function rider(string $name = 'Bekzod Alimov'): User
    {
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'phone' => '+998901234567',
        ]);
        $user->assignRole('courier');

        return $user;
    }

    /**
     * @param array<string, mixed> $over
     */
    private function drop(User $courier, string $status = 'assigned', array $over = []): Delivery
    {
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'channel' => 'delivery',
            'status' => 'cooking',
            'customer_name' => 'Dilnoza Aliyeva',
            'customer_phone' => '998901114567',
            'delivery_address' => 'Chilonzor 9, 41-uy',
            'delivery_note' => '2-podez, 4-qavat',
            'payment_method' => 'cash',
            'payment_state' => 'due',
            'total' => 120_000_00,
            'placed_at' => now()->subMinutes(20),
            ...$over,
        ]);

        return Delivery::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'order_id' => $order->getKey(),
            'courier_user_id' => $courier->getKey(),
            'status' => $status,
            'assigned_at' => now()->subMinutes(10),
        ]);
    }

    // ============ Whose round it is ============

    public function test_a_rider_sees_their_own_drops_and_nobody_elses(): void
    {
        $me = $this->rider();
        $them = $this->rider('Aziza Karimova');

        $this->drop($me);
        $this->drop($me);
        $this->drop($them);

        $this->actingAs($me);

        $round = $this->getJson('/api/v1/orders/deliveries/mine')->assertOk();

        $this->assertCount(2, $round->json('data'));
    }

    public function test_a_finished_drop_is_off_the_round(): void
    {
        $me = $this->rider();
        $this->drop($me, 'delivered');
        $this->drop($me, 'assigned');

        $this->actingAs($me);

        // Only what the rider is still carrying. A round that kept yesterday on
        // it is a list nobody reads.
        $this->assertCount(1, $this->getJson('/api/v1/orders/deliveries/mine')->assertOk()->json('data'));
    }

    // ============ What a rider is told ============

    public function test_the_round_carries_the_door_and_the_money_to_collect(): void
    {
        $me = $this->rider();
        $this->drop($me);
        $this->actingAs($me);

        $first = $this->getJson('/api/v1/orders/deliveries/mine')->assertOk()->json('data.0');

        $this->assertSame('Chilonzor 9, 41-uy', $first['order']['address']);
        $this->assertSame('2-podez, 4-qavat', $first['order']['address_note']);
        // The FULL number, deliberately: a courier outside a block of flats with
        // no doorbell has to ring the guest, and a masked one leaves them
        // knocking. The masking rule runs the other way — a guest may not have a
        // rider's personal number.
        $this->assertSame('998901114567', $first['order']['customer_phone']);
        $this->assertSame(120_000_00, $first['order']['collect_tiyin']);
    }

    public function test_a_prepaid_order_asks_the_guest_for_nothing(): void
    {
        $me = $this->rider();
        $this->drop($me, 'assigned', ['payment_method' => 'online', 'payment_state' => 'paid']);
        $this->actingAs($me);

        $first = $this->getJson('/api/v1/orders/deliveries/mine')->assertOk()->json('data.0');

        // "Cash on delivery" and "cash on delivery, already paid online" look
        // identical on a method column, and the difference is a rider asking for
        // money the guest already handed over.
        $this->assertSame(0, $first['order']['collect_tiyin']);
        $this->assertSame('paid', $first['order']['payment_state']);
    }

    // ============ Who may ask ============

    public function test_somebody_with_no_orders_permission_cannot_ask_at_all(): void
    {
        $accountant = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $accountant->assignRole('accountant');
        $this->actingAs($accountant);

        // The bookkeeper holds no `orders.*` at all — CLAUDE.md's role table
        // says so and `DesignRoleMatrixTest` proves it. Nothing about a rider's
        // round is theirs to read.
        $this->getJson('/api/v1/orders/deliveries/mine')->assertForbidden();
    }

    public function test_a_rider_at_another_restaurant_sees_nothing_of_this_one(): void
    {
        $me = $this->rider();
        $this->drop($me);

        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('courier');

        app(TenantContext::class)->set($other);
        $this->actingAs($stranger);

        $this->getJson('/api/v1/orders/deliveries/mine')->assertOk()->assertJsonCount(0, 'data');
    }
}
