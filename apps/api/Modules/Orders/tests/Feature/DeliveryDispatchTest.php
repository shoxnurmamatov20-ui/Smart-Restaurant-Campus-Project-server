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
use Modules\Orders\Models\Delivery;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * Dispatch, end to end: somebody assigns a rider and the guest can see them.
 *
 * The property this whole feature exists for is
 * `test_a_guest_watching_their_order_sees_the_rider_once_one_is_assigned`.
 * `PublicOrderController` answered `'courier' => null` for every delivery ever
 * placed and explained why — *"a dispatch module does not exist"* — so the
 * guest screens drew a courier card that was never filled. Everything else here
 * is what has to hold for that one answer to be safe to publish.
 */
final class DeliveryDispatchTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function signIn(string $role, ?Tenant $of = null): User
    {
        $user = User::factory()->create(['tenant_id' => ($of ?? $this->tenant)->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    private function rider(string $name = 'Bekzod Alimov', ?Tenant $of = null): User
    {
        $user = User::factory()->create([
            'tenant_id' => ($of ?? $this->tenant)->id,
            'name' => $name,
            'phone' => '+998901234567',
        ]);
        $user->assignRole('courier');

        return $user;
    }

    /** A guest's delivery, placed and fired. */
    private function delivery(array $over = []): Order
    {
        return Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'channel' => 'delivery',
            'status' => 'placed',
            'customer_phone' => '998901114567',
            'delivery_address' => 'Chilonzor 9, 41-uy',
            'placed_at' => now()->subMinutes(18),
            ...$over,
        ]);
    }

    private function assign(Order $order, User $courier): TestResponse
    {
        return $this->postJson("/api/v1/orders/orders/{$order->getKey()}/assign-courier", [
            'courier_user_id' => $courier->getKey(),
        ]);
    }

    /**
     * A JSON list, keyed by one of its columns.
     *
     * `collect($response->json(...))` cannot be typed — `json()` answers mixed
     * — and PHPStan refuses it rather than guessing. Narrowing here once is the
     * honest fix; the alternatives are a suppression or a cast.
     *
     * @return array<int|string, array<string, mixed>>
     */
    private static function keyed(mixed $rows, string $by): array
    {
        $keyed = [];

        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && isset($row[$by]) && (is_int($row[$by]) || is_string($row[$by]))) {
                $keyed[$row[$by]] = $row;
            }
        }

        return $keyed;
    }

    // ============ The answer a guest sees ============

    public function test_a_guest_watching_their_order_sees_the_rider_once_one_is_assigned(): void
    {
        $order = $this->delivery();

        $before = $this->track($order->number);
        $before->assertOk()->assertJsonPath('data.courier', null);

        $this->signIn('branch-manager');
        $this->assign($order, $this->rider())->assertCreated();

        $after = $this->track($order->number)->assertOk();

        // The first name and a masked number. A tracking link is guarded by a
        // bill number and four digits — enough to stop a stranger reading an
        // address, nowhere near enough to publish an employee's mobile.
        $after->assertJsonPath('data.courier.name', 'Bekzod');
        $after->assertJsonPath('data.courier.phone_masked', '+998 •• ••• 45 67');
        $after->assertJsonPath('data.courier.status', 'assigned');
    }

    public function test_a_takeaway_order_never_grows_a_courier(): void
    {
        $order = $this->delivery(['channel' => 'takeaway']);

        // The key is always present, so a client that draws a courier card off
        // it does not have to branch on the channel. It is simply null.
        $this->track($order->number)->assertOk()->assertJsonPath('data.courier', null);

        $this->signIn('branch-manager');
        $this->assign($order, $this->rider())
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'delivery.not_deliverable');
    }

    private function track(string $number, string $phone = '4567'): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->getJson("/api/v1/public/orders/{$number}?phone={$phone}");
    }

    // ============ Assigning ============

    public function test_a_manager_can_put_an_order_on_a_rider(): void
    {
        $this->signIn('branch-manager');
        $order = $this->delivery();
        $rider = $this->rider();

        $this->assign($order, $rider)
            ->assertCreated()
            ->assertJsonPath('data.status', 'assigned')
            ->assertJsonPath('data.courier.user_id', $rider->getKey());

        $row = Delivery::query()->where('order_id', $order->getKey())->firstOrFail();
        $this->assertSame($rider->getKey(), $row->courier_user_id);
        $this->assertNotNull($row->assigned_at);
    }

    public function test_reassigning_moves_the_bag_without_restarting_the_clock(): void
    {
        $this->signIn('branch-manager');
        $order = $this->delivery();

        $this->assign($order, $this->rider('Bekzod Alimov'))->assertCreated();

        $first = Delivery::query()->where('order_id', $order->getKey())->firstOrFail();

        $second = $this->rider('Sardor Nazarov');
        $this->assign($order, $second)->assertCreated();

        // One row, not two: "who has it NOW" must not become a sort over a
        // history on every render. And `assigned_at` stays where it was — the
        // clock a late-delivery argument runs on started with the first rider.
        $this->assertSame(1, Delivery::query()->where('order_id', $order->getKey())->count());

        $after = $first->refresh();
        $this->assertSame($second->getKey(), $after->courier_user_id);
        $this->assertSame(
            $first->assigned_at?->toIso8601String(),
            $after->assigned_at?->toIso8601String(),
        );
    }

    public function test_a_waiter_cannot_hand_out_deliveries(): void
    {
        $this->signIn('waiter');

        // `orders.manage`, not `orders.update`. Adding a dish to a bill and
        // deciding whose evening carries it are different powers, and every
        // waiter and cashier on the floor holds the first one.
        $this->assign($this->delivery(), $this->rider())->assertStatus(403);
    }

    public function test_an_operator_can_hand_out_deliveries(): void
    {
        // The intake desk is the role whose screen this is: the person on the
        // phone is who tells a courier where to go next.
        $this->signIn('order-operator');

        $this->assign($this->delivery(), $this->rider())->assertCreated();
    }

    public function test_a_rider_from_another_restaurant_is_not_a_rider_here(): void
    {
        $this->signIn('branch-manager');

        $elsewhere = $this->restaurant('lagmon-uyi');
        $stranger = $this->rider('Begona Kuryer', $elsewhere);

        // `public.users` carries no global tenant scope — identity is what
        // discovers the tenant — so this is the one read the controller has to
        // scope by hand, and this test is what says it did.
        $this->assign($this->delivery(), $stranger)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'delivery.courier_unknown');
    }

    public function test_somebody_who_is_not_a_courier_cannot_be_given_an_order(): void
    {
        $this->signIn('branch-manager');

        $cook = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cook->assignRole('cook');

        $this->assign($this->delivery(), $cook)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'delivery.courier_unknown');
    }

    // ============ The dispatcher's board ============

    public function test_the_board_shows_who_is_out_and_what_is_waiting(): void
    {
        $this->signIn('branch-manager');

        $busy = $this->rider('Bekzod Alimov');
        $free = $this->rider('Sardor Nazarov');

        $carried = $this->delivery();
        $this->assign($carried, $busy)->assertCreated();

        // A second order nobody has placed on anybody.
        $this->delivery();

        $board = $this->getJson('/api/v1/orders/deliveries')->assertOk();

        $couriers = self::keyed($board->json('data.couriers'), 'user_id');

        $this->assertSame('onway', $couriers[$busy->getKey()]['state']);
        $this->assertSame(1, $couriers[$busy->getKey()]['active']);
        $this->assertSame('free', $couriers[$free->getKey()]['state']);
        $this->assertSame(0, $couriers[$free->getKey()]['active']);

        // Exactly one waiting: the assigned order is off the list.
        $board->assertJsonCount(1, 'data.unassigned');
        $this->assertSame(18, $board->json('data.unassigned.0.waiting_minutes'));
    }

    public function test_the_board_does_not_show_another_restaurants_riders(): void
    {
        $this->signIn('branch-manager');
        $mine = $this->rider('Bekzod Alimov');

        $elsewhere = $this->restaurant('lagmon-uyi');
        $this->rider('Begona Kuryer', $elsewhere);

        $board = $this->getJson('/api/v1/orders/deliveries')->assertOk();

        $board->assertJsonCount(1, 'data.couriers');
        $this->assertSame($mine->getKey(), $board->json('data.couriers.0.user_id'));
    }

    public function test_an_accountant_cannot_read_the_dispatch_board(): void
    {
        // "Finance, reports, tax. Never touches orders" — the design says it
        // outright, and the accountant holds no order permission at all.
        $this->signIn('accountant');

        $this->getJson('/api/v1/orders/deliveries')->assertStatus(403);
    }
}
