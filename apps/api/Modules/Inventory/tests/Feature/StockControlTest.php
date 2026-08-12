<?php

declare(strict_types=1);

namespace Modules\Inventory\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;
use Tests\TestCase;

/**
 * Stock control. The invariant under test: the running balance and the movement
 * history can never disagree, because that gap is where a restaurant's margin
 * quietly disappears.
 */
final class StockControlTest extends TestCase
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

    public function test_unauthenticated_user_cannot_read_stock(): void
    {
        $this->getJson('/api/v1/inventory/ingredients')->assertStatus(401);
    }

    public function test_waiter_has_no_access_to_the_store(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/inventory/ingredients')->assertStatus(403);
    }

    public function test_cook_can_read_stock_but_not_change_it(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);
        $ingredient = Ingredient::factory()->create();

        $this->getJson('/api/v1/inventory/ingredients')->assertOk();
        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'receipt',
            'quantity' => 100,
        ])->assertStatus(403);
    }

    // ============ CRUD ============

    public function test_storekeeper_can_add_an_ingredient(): void
    {
        $this->actingAsStorekeeper();

        $this->postJson('/api/v1/inventory/ingredients', [
            'sku' => 'ING-0001',
            'name' => "Qo'y go'shti",
            'unit' => 'g',
            'min_quantity' => 10000,
            'cost_per_unit' => 12,
        ])
            ->assertCreated()
            ->assertJsonPath('data.sku', 'ING-0001')
            ->assertJsonPath('data.stock_quantity', 0)
            ->assertJsonPath('data.is_low', true);
    }

    public function test_ingredient_sku_is_unique_per_restaurant(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->create(['sku' => 'ING-0001']);

        $this->postJson('/api/v1/inventory/ingredients', ['sku' => 'ING-0001', 'name' => 'Boshqa'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sku');
    }

    public function test_an_unknown_unit_is_rejected(): void
    {
        $this->actingAsStorekeeper();

        $this->postJson('/api/v1/inventory/ingredients', [
            'sku' => 'ING-X', 'name' => 'Test', 'unit' => 'barrel',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('unit');
    }

    // ============ Movements ============

    public function test_a_receipt_raises_the_balance_and_leaves_an_audit_line(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 5000]);

        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'receipt',
            'quantity' => 12000,
            'reference' => 'PO-0007',
        ])
            ->assertCreated()
            ->assertJsonPath('movement.quantity', 12000)
            ->assertJsonPath('movement.balance_after', 17000)
            ->assertJsonPath('ingredient.stock_quantity', 17000);

        $this->assertDatabaseHas('stock_movements', [
            'ingredient_id' => $ingredient->id,
            'kind' => 'receipt',
            'reference' => 'PO-0007',
        ]);
    }

    public function test_consumption_lowers_the_balance(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 5000]);

        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'consumption',
            'quantity' => -1500,
        ])->assertCreated();

        $this->assertSame(3500, $ingredient->refresh()->stock_quantity);
    }

    public function test_stock_cannot_go_negative(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 1000]);

        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'consumption',
            'quantity' => -5000,
        ])->assertStatus(422);

        $this->assertSame(1000, $ingredient->refresh()->stock_quantity);
        $this->assertSame(0, StockMovement::where('ingredient_id', $ingredient->id)->count());
    }

    public function test_a_write_off_must_carry_a_reason(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 5000]);

        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'write_off',
            'quantity' => -500,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');

        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'write_off',
            'quantity' => -500,
            'reason' => "Muddati o'tgan",
        ])->assertCreated();
    }

    public function test_zero_quantity_movements_are_rejected(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create();

        $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
            'kind' => 'receipt',
            'quantity' => 0,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('quantity');
    }

    public function test_the_running_balance_always_matches_the_movement_history(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 0]);

        foreach ([['receipt', 10000], ['consumption', -2500], ['receipt', 4000], ['write_off', -500]] as [$kind, $qty]) {
            $this->postJson("/api/v1/inventory/ingredients/{$ingredient->id}/movements", [
                'kind' => $kind,
                'quantity' => $qty,
                'reason' => $kind === 'write_off' ? 'Buzilgan' : null,
            ])->assertCreated();
        }

        $sum = (int) StockMovement::where('ingredient_id', $ingredient->id)->sum('quantity');

        $this->assertSame(11000, $ingredient->refresh()->stock_quantity);
        $this->assertSame($sum, $ingredient->stock_quantity, 'Balance and history must never diverge');
    }

    // ============ Low stock ============

    public function test_low_filter_finds_what_needs_reordering(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->count(3)->create(['stock_quantity' => 50000, 'min_quantity' => 1000]);
        Ingredient::factory()->count(2)->low()->create();

        $this->getJson('/api/v1/inventory/ingredients?filter[low]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_stock_value_is_quantity_times_unit_cost(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 2500, 'cost_per_unit' => 12]);

        $this->getJson("/api/v1/inventory/ingredients/{$ingredient->id}")
            ->assertOk()
            ->assertJsonPath('data.stock_value', 30000);
    }

    // ============ Module info ============

    public function test_module_info_reports_low_stock_and_value(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->count(2)->create(['stock_quantity' => 1000, 'min_quantity' => 10, 'cost_per_unit' => 5]);
        Ingredient::factory()->low()->create(['cost_per_unit' => 0]);

        $this->getJson('/api/v1/inventory/')
            ->assertOk()
            ->assertJsonPath('module', 'Inventory')
            ->assertJsonPath('counts.ingredients', 3)
            ->assertJsonPath('counts.low_stock', 1)
            ->assertJsonPath('counts.stock_value_tiyin', 10000);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_store(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Ingredient::factory()->count(4)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/inventory/ingredients')->assertOk()->assertJsonCount(4, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/inventory/ingredients')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}
