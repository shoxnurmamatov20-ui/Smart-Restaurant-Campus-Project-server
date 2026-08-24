<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * The order list names its waiter.
 *
 * `orders-server.ts` drew a dash in that column and said why: *"the resource
 * carries `waiter_user_id` and no name. Resolving it is a second request per
 * row or an eager load on the endpoint; the endpoint is the right place, so the
 * column waits for it rather than firing twenty-five lookups to fill one
 * column."* This is the endpoint doing it.
 */
final class OrderNamesItsWaiterTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
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

    private function waiter(string $name): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => $name]);
        $user->assignRole('waiter');

        return $user;
    }

    public function test_the_list_carries_the_waiters_name_beside_their_id(): void
    {
        $this->signIn('branch-manager');
        $waiter = $this->waiter('Dilnoza Karimova');

        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'waiter_user_id' => $waiter->getKey(),
        ]);

        $this->getJson('/api/v1/orders/orders')
            ->assertOk()
            // The id stays: four clients already read it, and a filter takes an
            // id rather than a name.
            ->assertJsonPath('data.0.waiter_user_id', (int) $waiter->getKey())
            ->assertJsonPath('data.0.waiter.id', (int) $waiter->getKey())
            ->assertJsonPath('data.0.waiter.name', 'Dilnoza Karimova');
    }

    /**
     * A bill nobody is serving says so, rather than saying nothing.
     *
     * `null` is renderable as a blank; an absent key is what a client crashes
     * on, and a delivery order has no waiter by definition.
     */
    public function test_an_order_with_no_waiter_answers_null(): void
    {
        $this->signIn('branch-manager');

        Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'channel' => 'delivery',
            'waiter_user_id' => null,
        ]);

        $this->getJson('/api/v1/orders/orders')
            ->assertOk()
            ->assertJsonPath('data.0.waiter', null);
    }

    /**
     * One page, one join.
     *
     * The whole reason the column waited for the endpoint: resolving the name
     * per row is twenty-five round trips to draw one column, and it degrades
     * with the page size rather than with the work. Counted rather than
     * described, because an eager load is one refactor away from being lost.
     */
    public function test_a_page_of_orders_costs_one_query_for_all_of_their_waiters(): void
    {
        $this->signIn('branch-manager');

        foreach (range(1, 5) as $index) {
            Order::factory()->create([
                'tenant_id' => $this->tenant->id,
                'waiter_user_id' => $this->waiter("Ofitsiant {$index}")->getKey(),
            ]);
        }

        DB::enableQueryLog();
        $this->getJson('/api/v1/orders/orders')->assertOk();
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $waiterReads = array_filter(
            $queries,
            static fn (array $query): bool => str_contains((string) $query['query'], '"users"."id" in ('),
        );

        $this->assertCount(1, $waiterReads);
    }

    /**
     * The drawer opened from a row keeps the name.
     *
     * `show` is a different code path from `index` and would have been the easy
     * one to forget — the console opens the detail drawer straight from the
     * table, and a name that vanished on the way in reads as a data problem.
     */
    public function test_one_order_read_on_its_own_also_names_its_waiter(): void
    {
        $this->signIn('branch-manager');
        $waiter = $this->waiter('Dilnoza Karimova');

        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'waiter_user_id' => $waiter->getKey(),
        ]);

        $this->getJson("/api/v1/orders/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.waiter.name', 'Dilnoza Karimova');
    }
}
