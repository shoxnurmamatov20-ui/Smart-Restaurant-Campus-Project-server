<?php

declare(strict_types=1);

namespace Modules\Suppliers\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Models\Ingredient;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;
use Tests\TestCase;

/**
 * Raising an order, moving it along, and the figures the supplier list draws.
 *
 * PurchaseFlowTest already covers receiving, which is where a purchase becomes
 * stock and debt. This covers the paperwork either side of it: the basket that
 * arrives as one request, the ladder that stops a confirmed order winding back
 * to a draft, and the three derived columns that stopped the supplier table
 * being wired at all.
 */
final class PurchaseOrderLifecycleTest extends TestCase
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

    // ============ Raising one ============

    public function test_an_order_carries_its_lines_in_the_same_request(): void
    {
        $this->actingAsStorekeeper();
        $supplier = Supplier::factory()->create();
        $beef = Ingredient::factory()->create(['unit' => 'g']);

        $response = $this->postJson('/api/v1/suppliers/purchase-orders', [
            'supplier_id' => $supplier->id,
            'expected_at' => now()->addDay()->toIso8601String(),
            'items' => [
                ['ingredient_id' => $beef->id, 'name' => 'Mol go\'shti', 'unit' => 'g', 'quantity' => 18_000, 'unit_price' => 85],
                ['name' => 'Qadoqlash plyonkasi', 'unit' => 'pcs', 'quantity' => 20, 'unit_price' => 3_000],
            ],
        ])->assertCreated();

        // The header total is the sum of the lines and is never sent by the
        // client: 18 000 × 85 + 20 × 3 000.
        $response->assertJsonPath('data.total', 18_000 * 85 + 20 * 3_000);
        $response->assertJsonCount(2, 'data.items');
        $response->assertJsonPath('data.items.0.unit', 'g');
    }

    public function test_the_server_numbers_the_order_when_the_client_does_not(): void
    {
        $this->actingAsStorekeeper();
        $supplier = Supplier::factory()->create();

        $first = $this->postJson('/api/v1/suppliers/purchase-orders', ['supplier_id' => $supplier->id])
            ->assertCreated()->json('data.number');
        $second = $this->postJson('/api/v1/suppliers/purchase-orders', ['supplier_id' => $supplier->id])
            ->assertCreated()->json('data.number');

        // Two buyers on two tills must never invent the same document number,
        // which is why the client is no longer allowed to.
        $this->assertMatchesRegularExpression('/^PO-\d{4}$/', (string) $first);
        $this->assertNotSame($first, $second);
    }

    public function test_an_order_may_not_be_posted_straight_to_received(): void
    {
        $this->actingAsStorekeeper();
        $supplier = Supplier::factory()->create();

        // Receiving raises stock and grows a payable. A create that could
        // declare it would book a delivery with nothing on a shelf.
        $this->postJson('/api/v1/suppliers/purchase-orders', [
            'supplier_id' => $supplier->id,
            'status' => 'received',
        ])->assertApiValidationErrors('status');
    }

    // ============ The ladder ============

    public function test_an_order_walks_draft_to_sent_to_confirmed(): void
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'sent'])
            ->assertOk()->assertJsonPath('data.status', 'sent');

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'confirmed'])
            ->assertOk()->assertJsonPath('data.status', 'confirmed');
    }

    public function test_a_confirmed_order_cannot_wind_back_to_a_draft(): void
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();
        $order->update(['status' => 'confirmed']);

        // The supplier has already loaded the van. `draft` is not even an
        // accepted value on this route, so it fails validation rather than the
        // ladder — which is the earlier and better of the two refusals.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'draft'])
            ->assertApiValidationErrors('status');

        // And the one that does reach the ladder.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'sent'])
            ->assertApiError('purchase_order.invalid_transition', 'status');
    }

    public function test_an_empty_order_cannot_be_sent(): void
    {
        $this->actingAsStorekeeper();
        $supplier = Supplier::factory()->create();
        $order = PurchaseOrder::factory()->create(['supplier_id' => $supplier->id, 'status' => 'draft']);

        // A draft may be empty — that is what a draft is for. What may not
        // happen is an empty document reaching the supplier.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'sent'])
            ->assertApiError('purchase_order.no_lines', 'items');
    }

    public function test_a_received_order_is_closed_to_every_change(): void
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();
        $order->update(['status' => 'received', 'received_at' => now()]);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'cancelled'])
            ->assertApiError('purchase_order.already_received', 'status');

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/items", [
            'name' => 'Qo\'shimcha', 'quantity' => 1, 'unit_price' => 100,
        ])->assertApiError('purchase_order.already_received');

        $this->patchJson("/api/v1/suppliers/purchase-orders/{$order->id}", ['note' => 'kech'])
            ->assertApiError('purchase_order.already_received');
    }

    public function test_a_cancelled_order_keeps_the_reason_it_was_called_off(): void
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", [
            'status' => 'cancelled',
            'reason' => 'Narx ikki barobar oshdi',
        ])->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.note', 'Narx ikki barobar oshdi');
    }

    // ============ Permissions and isolation ============

    public function test_a_waiter_cannot_move_an_order_along(): void
    {
        $order = $this->orderAsStorekeeperThenSignInAs('waiter');

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'sent'])
            ->assertStatus(403);
    }

    public function test_another_restaurants_order_does_not_exist_here(): void
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('storekeeper');
        $this->actingAs($stranger);

        // 404 rather than 403: from the other restaurant this row does not
        // exist, and saying "forbidden" would confirm that it does.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/status", ['status' => 'sent'])
            ->assertStatus(404);
    }

    // ============ The supplier list's derived columns ============

    public function test_the_supplier_list_computes_on_time_from_the_orders(): void
    {
        $this->actingAsStorekeeper();
        $supplier = Supplier::factory()->create(['category' => 'meat', 'lead_time_days' => 1]);

        // Two on time, one two days late.
        PurchaseOrder::factory()->count(2)->create([
            'supplier_id' => $supplier->id,
            'status' => 'received',
            'expected_at' => now()->subDays(4),
            'received_at' => now()->subDays(4),
            'total' => 1_000_000,
        ]);
        PurchaseOrder::factory()->create([
            'supplier_id' => $supplier->id,
            'status' => 'received',
            'expected_at' => now()->subDays(4),
            'received_at' => now()->subDays(2),
            'total' => 500_000,
        ]);
        // Still open — counted in the open column and in neither of the others.
        PurchaseOrder::factory()->create([
            'supplier_id' => $supplier->id,
            'status' => 'sent',
            'expected_at' => now()->addDay(),
            'total' => 9_000_000,
        ]);

        $this->getJson('/api/v1/suppliers/suppliers')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'meat')
            ->assertJsonPath('data.0.lead_time_days', 1)
            ->assertJsonPath('data.0.on_time_percent', 67)
            ->assertJsonPath('data.0.open_purchase_orders', 1)
            // The quarter's spend counts what actually arrived, not what was
            // asked for — the open nine million is not money spent.
            ->assertJsonPath('data.0.quarter_spend', 2_500_000);
    }

    public function test_a_supplier_nothing_has_arrived_from_has_no_on_time_figure(): void
    {
        $this->actingAsStorekeeper();
        Supplier::factory()->create();

        // Null, not zero. Zero reads as "never on time", which is the opposite
        // of what an empty history means — and it is the column a buyer sorts
        // by.
        $this->getJson('/api/v1/suppliers/suppliers')
            ->assertOk()
            ->assertJsonPath('data.0.on_time_percent', null);
    }

    public function test_receiving_a_delivery_stamps_the_last_delivery_column(): void
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();
        $order->update(['status' => 'confirmed']);

        $this->assertNull($order->supplier?->last_delivery_at);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive")->assertOk();

        $this->assertNotNull($order->supplier?->refresh()->last_delivery_at);
    }

    public function test_the_list_can_be_filtered_by_what_a_company_sells(): void
    {
        $this->actingAsStorekeeper();
        Supplier::factory()->create(['category' => 'meat', 'name' => 'Go\'sht bazasi']);
        Supplier::factory()->create(['category' => 'dairy', 'name' => 'Sut kombinati']);

        $this->getJson('/api/v1/suppliers/suppliers?filter[category]=dairy')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Sut kombinati');
    }

    // ============ Helpers ============

    private function orderWithOneLine(): PurchaseOrder
    {
        $supplier = Supplier::factory()->create();
        $order = PurchaseOrder::factory()->create(['supplier_id' => $supplier->id, 'status' => 'draft']);
        $ingredient = Ingredient::factory()->create();

        $order->items()->create([
            'ingredient_id' => $ingredient->id,
            'name' => $ingredient->name,
            'unit' => $ingredient->unit,
            'quantity' => 1_000,
            'unit_price' => 50,
            'total_price' => 50_000,
        ]);

        return $order->recalculateTotal();
    }

    private function orderAsStorekeeperThenSignInAs(string $role): PurchaseOrder
    {
        $this->actingAsStorekeeper();
        $order = $this->orderWithOneLine();

        $tenantId = app(TenantContext::class)->id();
        $user = User::factory()->create(['tenant_id' => $tenantId]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $order;
    }
}
