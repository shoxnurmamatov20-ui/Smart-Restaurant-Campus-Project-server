<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * The order flow is the heart of the platform: if this is wrong, a guest is
 * charged the wrong amount. Money assertions here are deliberately exact.
 */
final class OrderFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsWaiter(): User
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        return $user;
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /** 45 000 so'm, sellable. */
    private function dish(int $priceTiyin = 4500000): MenuItem
    {
        return MenuItem::factory()->create(['price' => $priceTiyin]);
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_list_orders(): void
    {
        $this->getJson('/api/v1/orders/orders')->assertStatus(401);
    }

    public function test_storekeeper_cannot_see_orders(): void
    {
        $user = User::factory()->create();
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        $this->getJson('/api/v1/orders/orders')->assertStatus(403);
    }

    public function test_waiter_can_open_an_order_but_not_delete_it(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create();

        $this->getJson('/api/v1/orders/orders')->assertOk();
        $this->deleteJson("/api/v1/orders/orders/{$order->id}")->assertStatus(403);
    }

    // ============ Creating a bill ============

    public function test_waiter_can_open_a_dine_in_order(): void
    {
        $this->actingAsWaiter();

        $this->postJson('/api/v1/orders/orders', [
            'number' => 'A-0001',
            'channel' => 'dine_in',
            'table_label' => 'A-7',
            'guests_count' => 3,
        ])
            ->assertCreated()
            ->assertJsonPath('data.number', 'A-0001')
            ->assertJsonPath('data.channel', 'dine_in')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.is_open', true)
            ->assertJsonPath('data.total', 0);
    }

    public function test_order_number_is_unique_per_restaurant(): void
    {
        $this->actingAsWaiter();
        Order::factory()->create(['number' => 'A-0001']);

        $this->postJson('/api/v1/orders/orders', ['number' => 'A-0001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('number');
    }

    // ============ Bill lines and money ============

    public function test_adding_a_dish_snapshots_its_price_and_updates_the_total(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create();
        $dish = $this->dish(4500000); // 45 000 so'm

        $this->postJson("/api/v1/orders/orders/{$order->id}/items", [
            'menu_item_id' => $dish->id,
            'quantity' => 2,
        ])
            ->assertCreated()
            ->assertJsonPath('data.sku', $dish->sku)
            ->assertJsonPath('data.unit_price', 4500000)
            ->assertJsonPath('data.total_price', 9000000);

        $this->assertSame(9000000, $order->refresh()->subtotal);
        $this->assertSame(9000000, $order->total);
    }

    public function test_repricing_the_menu_does_not_change_an_existing_bill(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create();
        $dish = $this->dish(4500000);

        $this->postJson("/api/v1/orders/orders/{$order->id}/items", [
            'menu_item_id' => $dish->id,
            'quantity' => 1,
        ])->assertCreated();

        // The chef raises the price after the guest already ordered.
        $dish->update(['price' => 9900000]);

        $this->assertSame(4500000, $order->refresh()->total, 'A past bill must never be repriced');
    }

    public function test_a_dish_on_the_stop_list_cannot_be_ordered(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create();
        $dish = MenuItem::factory()->stopped()->create();

        $this->postJson("/api/v1/orders/orders/{$order->id}/items", [
            'menu_item_id' => $dish->id,
            'quantity' => 1,
        ])->assertStatus(422);

        $this->assertSame(0, $order->refresh()->total);
    }

    public function test_removing_a_line_re_derives_the_bill(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create();
        $a = $this->dish(3000000);
        $b = $this->dish(2000000);

        foreach ([$a, $b] as $dish) {
            $this->postJson("/api/v1/orders/orders/{$order->id}/items", [
                'menu_item_id' => $dish->id,
                'quantity' => 1,
            ])->assertCreated();
        }
        $this->assertSame(5000000, $order->refresh()->total);

        $line = $order->items()->where('sku', $a->sku)->firstOrFail();
        $this->deleteJson("/api/v1/orders/orders/{$order->id}/items/{$line->id}")->assertNoContent();

        $this->assertSame(2000000, $order->refresh()->total);
    }

    public function test_discount_and_service_charge_are_applied_to_the_total(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create(['discount_total' => 500000, 'service_charge' => 1000000]);
        $dish = $this->dish(4000000);

        $this->postJson("/api/v1/orders/orders/{$order->id}/items", [
            'menu_item_id' => $dish->id,
            'quantity' => 1,
        ])->assertCreated();

        // 40 000 − 5 000 + 10 000 = 45 000 so'm
        $this->assertSame(4500000, $order->refresh()->total);
    }

    // ============ Flow ============

    public function test_placing_an_order_stamps_placed_at(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->draft()->create();

        $this->postJson("/api/v1/orders/orders/{$order->id}/status", ['status' => 'placed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'placed');

        $this->assertNotNull($order->refresh()->placed_at);
    }

    public function test_a_paid_bill_is_immutable(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->paid()->create();

        $this->postJson("/api/v1/orders/orders/{$order->id}/status", ['status' => 'placed'])
            ->assertStatus(422);

        $dish = $this->dish();
        $this->postJson("/api/v1/orders/orders/{$order->id}/items", [
            'menu_item_id' => $dish->id,
            'quantity' => 1,
        ])->assertStatus(422);
    }

    public function test_cancelling_requires_a_reason_and_closes_the_bill(): void
    {
        $this->actingAsWaiter();
        $order = Order::factory()->create();

        $this->postJson("/api/v1/orders/orders/{$order->id}/cancel", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');

        $this->postJson("/api/v1/orders/orders/{$order->id}/cancel", ['reason' => 'Mehmon ketdi'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertNotNull($order->refresh()->closed_at);
        $this->assertStringContainsString('Mehmon ketdi', (string) $order->note);
    }

    public function test_open_filter_excludes_closed_bills(): void
    {
        $this->actingAsWaiter();
        Order::factory()->count(3)->create();
        Order::factory()->count(2)->paid()->create();
        Order::factory()->cancelled()->create();

        $this->getJson('/api/v1/orders/orders?filter[open]=1')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    // ============ Module info ============

    public function test_module_info_reports_open_orders_and_revenue(): void
    {
        $this->actingAsWaiter();
        Order::factory()->count(2)->create();
        Order::factory()->paid()->create(['total' => 12000000]);

        $this->getJson('/api/v1/orders/')
            ->assertOk()
            ->assertJsonPath('module', 'Orders')
            ->assertJsonPath('counts.open', 2)
            ->assertJsonPath('counts.today_revenue_tiyin', 12000000);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_orders(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Order::factory()->count(3)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/orders/orders')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/orders/orders')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }

    public function test_order_lines_are_reachable_for_the_kitchen(): void
    {
        $this->actingAsOwner();
        $order = Order::factory()->create();
        OrderItem::factory()->count(2)->create(['order_id' => $order->id, 'station' => 'grill']);
        OrderItem::factory()->create(['order_id' => $order->id, 'station' => 'bar']);

        $this->getJson('/api/v1/orders/items?filter[station]=grill')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
