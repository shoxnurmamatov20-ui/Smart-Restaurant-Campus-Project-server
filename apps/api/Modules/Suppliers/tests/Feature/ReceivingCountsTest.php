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
use Modules\Suppliers\Models\PurchaseOrderItem;
use Modules\Suppliers\Models\Supplier;
use Tests\TestCase;

/**
 * Counting the van, line by line.
 *
 * The receiving table on the operations screen draws three columns — ordered,
 * received, variance — and could fill exactly one: a purchase order recorded
 * what was ORDERED and the receive endpoint took the document whole. Printing
 * the ordered figure under "received" would have manufactured a zero variance
 * on every line, which is the number a credit note is written from.
 *
 * The behaviour that matters is what reaches the SHELF. Two kilos of beef that
 * never arrived must not appear in stock: the stock-take three weeks later is
 * where anybody would otherwise find out.
 */
final class ReceivingCountsTest extends TestCase
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

    /** @return array{PurchaseOrder, Ingredient, PurchaseOrderItem} */
    private function vanOf(int $ordered): array
    {
        $supplier = Supplier::factory()->create(['payment_terms_days' => 7, 'debt' => 0]);
        $rice = Ingredient::factory()->create(['stock_quantity' => 5_000]);
        $order = PurchaseOrder::factory()->create(['supplier_id' => $supplier->id]);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/items", [
            'ingredient_id' => $rice->id,
            'name' => 'Guruch',
            'quantity' => $ordered,
            'unit_price' => 3,
        ])->assertCreated();

        /** @var PurchaseOrderItem $line */
        $line = $order->refresh()->items()->firstOrFail();

        return [$order, $rice, $line];
    }

    public function test_a_short_delivery_raises_the_shelf_by_what_arrived(): void
    {
        $this->actingAsStorekeeper();
        [$order, $rice, $line] = $this->vanOf(20_000);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive", [
            'lines' => [['id' => $line->id, 'received_quantity' => 18_000]],
        ])
            ->assertOk()
            ->assertJsonPath('data.items.0.quantity', 20_000)
            ->assertJsonPath('data.items.0.received_quantity', 18_000);

        // 5 000 on the shelf plus the 18 kg that actually came off the van.
        $this->assertSame(23_000, $rice->refresh()->stock_quantity);
        $this->assertDatabaseHas('stock_movements', [
            'ingredient_id' => $rice->id, 'kind' => 'receipt', 'quantity' => 18_000,
        ]);
    }

    public function test_what_is_owed_is_untouched_by_the_count(): void
    {
        $this->actingAsStorekeeper();
        [$order, , $line] = $this->vanOf(20_000);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive", [
            'lines' => [['id' => $line->id, 'received_quantity' => 18_000]],
        ])->assertOk();

        // 20 000 × 3 = 60 000, which is what the supplier invoiced. Correcting
        // an invoice down is a credit note between two businesses, not
        // something a storekeeper's tablet decides.
        $this->assertSame(60_000, $order->refresh()->supplier?->refresh()->debt);
    }

    public function test_a_line_that_did_not_come_at_all_moves_no_stock(): void
    {
        $this->actingAsStorekeeper();
        [$order, $rice, $line] = $this->vanOf(20_000);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive", [
            'lines' => [['id' => $line->id, 'received_quantity' => 0]],
        ])->assertOk();

        $this->assertSame(5_000, $rice->refresh()->stock_quantity);
        // And no zero-quantity movement in the ledger to read past.
        $this->assertDatabaseMissing('stock_movements', [
            'ingredient_id' => $rice->id, 'kind' => 'receipt', 'quantity' => 0,
        ]);
        $this->assertSame(0, $line->refresh()->received_quantity);
    }

    public function test_signing_for_the_whole_document_still_works_and_records_no_count(): void
    {
        $this->actingAsStorekeeper();
        [$order, $rice, $line] = $this->vanOf(20_000);

        // The storekeeper's phone confirms a whole document at the service
        // entrance and has no counts to send. Null is "nobody counted" — not
        // zero and not "all of it" — and the screen draws an em dash for it.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive")->assertOk();

        $this->assertSame(25_000, $rice->refresh()->stock_quantity);
        $this->assertNull($line->refresh()->received_quantity);
    }

    public function test_a_count_naming_another_orders_line_is_ignored(): void
    {
        $this->actingAsStorekeeper();
        [$order, $rice] = $this->vanOf(20_000);
        [, , $strangerLine] = $this->vanOf(9_000);

        // A stale tab, or a copied request. The line belongs to yesterday's
        // van, so it must not silently short this one.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive", [
            'lines' => [['id' => $strangerLine->id, 'received_quantity' => 1]],
        ])->assertOk();

        $this->assertSame(25_000, $rice->refresh()->stock_quantity);
        $this->assertNull($strangerLine->refresh()->received_quantity);
    }

    public function test_a_waiter_cannot_sign_for_a_delivery(): void
    {
        $this->actingAsStorekeeper();
        [$order, , $line] = $this->vanOf(20_000);

        $waiter = User::factory()->create();
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/receive", [
            'lines' => [['id' => $line->id, 'received_quantity' => 1]],
        ])->assertStatus(403);
    }

    public function test_another_restaurants_delivery_cannot_be_received(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-receiving', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        $theirOrder = PurchaseOrder::factory()->create([
            'tenant_id' => $other->id,
            'supplier_id' => Supplier::factory()->create(['tenant_id' => $other->id])->id,
        ]);
        app(TenantContext::class)->clear();

        $this->actingAsStorekeeper();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$theirOrder->id}/receive")
            ->assertStatus(404);
    }
}
