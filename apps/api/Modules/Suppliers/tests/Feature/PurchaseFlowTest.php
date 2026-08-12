<?php

declare(strict_types=1);

namespace Modules\Suppliers\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Models\Ingredient;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;
use Tests\TestCase;

/**
 * Purchasing. The interesting part is receiving: that single call is where a
 * purchase order turns into real stock and real debt.
 */
final class PurchaseFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsStorekeeper(): User
    {
        $user = User::factory()->create();
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_list_suppliers(): void
    {
        $this->getJson('/api/v1/suppliers/suppliers')->assertStatus(401);
    }

    public function test_waiter_has_no_access_to_purchasing(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/suppliers/suppliers')->assertStatus(403);
    }

    public function test_accountant_can_read_suppliers_but_not_create_them(): void
    {
        $user = User::factory()->create();
        $user->assignRole('accountant');
        $this->actingAs($user);

        $this->getJson('/api/v1/suppliers/suppliers')->assertOk();
        $this->postJson('/api/v1/suppliers/suppliers', ['code' => 'S-1', 'name' => 'Test'])
            ->assertStatus(403);
    }

    // ============ Suppliers ============

    public function test_storekeeper_can_register_a_supplier(): void
    {
        $this->actingAsStorekeeper();

        $this->postJson('/api/v1/suppliers/suppliers', [
            'code' => 'SUP-001',
            'name' => "Toshkent Go'sht Bazasi",
            'phone' => '+998901112233',
            'payment_terms_days' => 7,
        ])
            ->assertCreated()
            ->assertJsonPath('data.code', 'SUP-001')
            ->assertJsonPath('data.debt', 0)
            ->assertJsonPath('data.rating', 5);
    }

    public function test_supplier_code_is_unique_per_restaurant(): void
    {
        $this->actingAsStorekeeper();
        Supplier::factory()->create(['code' => 'SUP-001']);

        $this->postJson('/api/v1/suppliers/suppliers', ['code' => 'SUP-001', 'name' => 'Boshqa'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    public function test_in_debt_filter_finds_who_we_owe(): void
    {
        $this->actingAsStorekeeper();
        Supplier::factory()->count(3)->create();
        Supplier::factory()->count(2)->inDebt()->create();

        $this->getJson('/api/v1/suppliers/suppliers?filter[in_debt]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Purchase orders ============

    public function test_adding_lines_recalculates_the_order_total(): void
    {
        $this->actingAsStorekeeper();
        $po = PurchaseOrder::factory()->create();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/items", [
            'name' => 'Guruch',
            'quantity' => 20000,   // 20 kg in grams
            'unit_price' => 3,     // 3 tiyin per gram
        ])
            ->assertCreated()
            ->assertJsonPath('data.total_price', 60000);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/items", [
            'name' => 'Sabzi',
            'quantity' => 10000,
            'unit_price' => 1,
        ])->assertCreated();

        $this->assertSame(70000, $po->refresh()->total);
    }

    // ============ Receiving — the integration that matters ============

    public function test_receiving_a_delivery_moves_stock_and_records_the_debt(): void
    {
        $this->actingAsStorekeeper();

        $supplier = Supplier::factory()->create(['payment_terms_days' => 7, 'debt' => 0]);
        $rice = Ingredient::factory()->create(['stock_quantity' => 5000]);
        $po = PurchaseOrder::factory()->create(['supplier_id' => $supplier->id]);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/items", [
            'ingredient_id' => $rice->id,
            'name' => 'Guruch',
            'quantity' => 20000,
            'unit_price' => 3,
        ])->assertCreated();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/receive")
            ->assertOk()
            ->assertJsonPath('data.status', 'received');

        // Stock went up by exactly what was delivered...
        $this->assertSame(25000, $rice->refresh()->stock_quantity);

        // ...and left an auditable movement referencing the order.
        $this->assertDatabaseHas('stock_movements', [
            'ingredient_id' => $rice->id,
            'kind' => 'receipt',
            'quantity' => 20000,
            'reference' => $po->number,
        ]);

        // Payment terms mean we now owe them.
        $this->assertSame(60000, $supplier->refresh()->debt);
    }

    public function test_paying_on_delivery_creates_no_debt(): void
    {
        $this->actingAsStorekeeper();

        $supplier = Supplier::factory()->create(['payment_terms_days' => 0]);
        $po = PurchaseOrder::factory()->create(['supplier_id' => $supplier->id]);
        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/items", [
            'name' => 'Sabzi', 'quantity' => 1000, 'unit_price' => 2,
        ])->assertCreated();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/receive")->assertOk();

        $this->assertSame(0, $supplier->refresh()->debt);
    }

    public function test_a_delivery_cannot_be_received_twice(): void
    {
        $this->actingAsStorekeeper();

        $rice = Ingredient::factory()->create(['stock_quantity' => 0]);
        $po = PurchaseOrder::factory()->create();
        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/items", [
            'ingredient_id' => $rice->id, 'name' => 'Guruch', 'quantity' => 5000, 'unit_price' => 3,
        ])->assertCreated();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/receive")->assertOk();
        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/receive")->assertStatus(422);

        // One clumsy double-tap must not double the whole store.
        $this->assertSame(5000, $rice->refresh()->stock_quantity);
    }

    public function test_a_received_order_cannot_gain_new_lines(): void
    {
        $this->actingAsStorekeeper();
        $po = PurchaseOrder::factory()->received()->create();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$po->id}/items", [
            'name' => 'Un', 'quantity' => 1000, 'unit_price' => 1,
        ])->assertStatus(422);
    }

    // ============ Module info ============

    public function test_module_info_reports_open_orders_and_total_debt(): void
    {
        $this->actingAsStorekeeper();
        Supplier::factory()->inDebt(12000000)->create();
        Supplier::factory()->inDebt(8000000)->create();
        PurchaseOrder::factory()->count(2)->create();
        PurchaseOrder::factory()->received()->create();

        $this->getJson('/api/v1/suppliers/')
            ->assertOk()
            ->assertJsonPath('module', 'Suppliers')
            ->assertJsonPath('counts.open_orders', 2)
            ->assertJsonPath('counts.total_debt_tiyin', 20000000);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_suppliers(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Supplier::factory()->count(3)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/suppliers/suppliers')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/suppliers/suppliers')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}
