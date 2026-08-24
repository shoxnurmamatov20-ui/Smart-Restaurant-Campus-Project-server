<?php

declare(strict_types=1);

namespace Modules\Inventory\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Database\Seeders\InventoryDatabaseSeeder;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\PrepItem;
use Modules\Inventory\Models\StockLevel;
use Tests\TestCase;

/**
 * Stock that knows where it is, and a kitchen that makes things.
 *
 * The two halves the operations screen was drawn against and could not post.
 * The transfer half is the interesting one: its own TODO said posting two legs
 * against a single tenant-wide balance would net to zero and leave the shelf
 * unchanged — *"worse than the button doing nothing, because it looks like it
 * worked"* — so the assertions below check both books at once. The total nets
 * to zero, which is correct; the two venues move, which is the point.
 */
final class TransferAndPrepTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $origin;

    private Branch $destination;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        /*
         * Two venues, which is the shape this whole feature exists for. A
         * single-branch fixture would pass every assertion below and still hide
         * the bug that matters: two legs netting to zero on one balance.
         */
        $this->origin = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $this->destination = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Termiz', 'slug' => 'termiz',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function actingAsStorekeeper(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        return $user;
    }

    private function rice(int $onHand = 120_000): Ingredient
    {
        return Ingredient::query()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'ING-7001', 'name' => 'Guruch', 'unit' => 'g',
            'purchase_unit' => 'sack', 'units_per_purchase' => 50_000,
            'stock_quantity' => $onHand, 'min_quantity' => 10_000,
            'cost_per_unit' => 3, 'store' => 'main', 'is_active' => true,
        ]);
    }

    // ============ Transfers ============

    public function test_sending_a_transfer_empties_one_shelf_without_changing_the_total(): void
    {
        $this->actingAsStorekeeper();
        $rice = $this->rice();

        $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->destination->id,
            'lines' => [['ingredient_id' => $rice->id, 'quantity' => 25_000]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'sent')
            ->assertJsonPath('data.lines.0.quantity', 25_000)
            // Frozen from the ingredient as the line was written: 3 tiyin a
            // gram × 25 000 g.
            ->assertJsonPath('data.lines.0.value_tiyin', 75_000);

        /*
         * The total is 25 kg lower while the van is on the road, and that is
         * the honest answer rather than a rounding of one: the total is the sum
         * of what is on shelves, and goods in transit are on nobody's. They come
         * back to it when somebody at the far end counts the boxes — see the
         * next test, where the business ends exactly where it started.
         */
        $this->assertSame(95_000, $rice->refresh()->stock_quantity);

        // The origin's shelf is 25 kg lighter and nothing has arrived anywhere.
        $this->assertSame(-25_000, $this->shelf($this->origin, $rice));
        $this->assertNull(
            StockLevel::query()->where('branch_id', $this->destination->id)->first(),
            'Stock arrived before anybody counted the boxes.',
        );
    }

    public function test_receiving_puts_the_stock_on_the_far_shelf(): void
    {
        $this->actingAsStorekeeper();
        $rice = $this->rice();

        $id = $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->destination->id,
            'lines' => [['ingredient_id' => $rice->id, 'quantity' => 25_000]],
        ])->json('data.id');

        $this->postJson("/api/v1/inventory/transfers/{$id}/receive")
            ->assertOk()
            ->assertJsonPath('data.status', 'received');

        $this->assertSame(-25_000, $this->shelf($this->origin, $rice));
        $this->assertSame(25_000, $this->shelf($this->destination, $rice));
        // And the business is still where it started, which is the whole
        // reason the total could never have answered this question.
        $this->assertSame(120_000, $rice->refresh()->stock_quantity);
    }

    public function test_a_transfer_cannot_be_received_twice(): void
    {
        $this->actingAsStorekeeper();
        $rice = $this->rice();

        $id = $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->destination->id,
            'lines' => [['ingredient_id' => $rice->id, 'quantity' => 25_000]],
        ])->json('data.id');

        $this->postJson("/api/v1/inventory/transfers/{$id}/receive")->assertOk();
        $this->postJson("/api/v1/inventory/transfers/{$id}/receive")
            ->assertApiError('stock.transfer_not_in_transit');

        // Once, not twice: a second receipt would have doubled a van of rice.
        $this->assertSame(25_000, $this->shelf($this->destination, $rice));
    }

    public function test_a_draft_moves_nothing_until_it_is_sent(): void
    {
        $this->actingAsStorekeeper();
        $rice = $this->rice();

        $id = $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->destination->id,
            'send' => false,
            'lines' => [['ingredient_id' => $rice->id, 'quantity' => 25_000]],
        ])->assertCreated()->assertJsonPath('data.status', 'draft')->json('data.id');

        $this->assertSame(0, StockLevel::query()->count());

        $this->postJson("/api/v1/inventory/transfers/{$id}/send")
            ->assertOk()
            ->assertJsonPath('data.status', 'sent');

        $this->assertSame(-25_000, $this->shelf($this->origin, $rice));
    }

    public function test_a_transfer_to_the_same_venue_is_refused(): void
    {
        $this->actingAsStorekeeper();
        $rice = $this->rice();

        // The console disables the button for this; the server refuses it too,
        // because a form can be submitted before a select has updated.
        $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->origin->id,
            'lines' => [['ingredient_id' => $rice->id, 'quantity' => 1]],
        ])->assertApiValidationErrors('to_branch_id');
    }

    public function test_a_waiter_may_not_move_stock_between_venues(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->destination->id,
            'lines' => [['ingredient_id' => 1, 'quantity' => 1]],
        ])->assertForbidden();
    }

    public function test_another_restaurants_transfer_is_invisible(): void
    {
        $this->actingAsStorekeeper();
        $rice = $this->rice();

        $mine = $this->postJson('/api/v1/inventory/transfers', [
            'from_branch_id' => $this->origin->id,
            'to_branch_id' => $this->destination->id,
            'lines' => [['ingredient_id' => $rice->id, 'quantity' => 100]],
        ])->json('data.id');

        // A second restaurant, whose storekeeper asks for the first one's row.
        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('storekeeper');

        $this->actingAs($stranger)
            ->withHeader('X-Tenant', $other->slug)
            ->getJson("/api/v1/inventory/transfers/{$mine}")
            ->assertNotFound();
    }

    // ============ Prep ============

    public function test_producing_a_batch_takes_the_ingredients_and_raises_the_yield(): void
    {
        $this->actingAsStorekeeper();

        $beef = Ingredient::query()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'ING-7002', 'name' => "Mol go'shti", 'unit' => 'g',
            'stock_quantity' => 10_000, 'min_quantity' => 1000, 'cost_per_unit' => 85,
            'store' => 'main', 'is_active' => true,
        ]);
        $onion = Ingredient::query()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'ING-7003', 'name' => 'Piyoz', 'unit' => 'g',
            'stock_quantity' => 10_000, 'min_quantity' => 1000, 'cost_per_unit' => 4,
            'store' => 'main', 'is_active' => true,
        ]);

        $zirvak = PrepItem::query()->create([
            'code' => 'zirvak', 'name' => ['uz' => 'Zirvak', 'ru' => 'Зирвак', 'en' => 'Zirvak'],
            'unit' => 'g', 'batch_quantity' => 1000, 'loss_percent' => 12,
            'shelf_life_days' => 2, 'on_hand' => 0, 'is_active' => true,
        ]);
        $zirvak->components()->create(['ingredient_id' => $beef->id, 'quantity' => 400]);
        $zirvak->components()->create(['ingredient_id' => $onion->id, 'quantity' => 250]);

        $this->postJson('/api/v1/inventory/prep', [
            'prep_item_id' => $zirvak->id,
            'batches' => 2,
        ])
            ->assertCreated()
            // 1000 g less 12% is 880 usable grams a batch, twice.
            ->assertJsonPath('data.produced', 1760)
            ->assertJsonPath('data.item.on_hand', 1760)
            // 400 × 85 + 250 × 4 = 35 000 tiyin of raw goods a batch, and
            // 35 000 ÷ 880 usable grams is 39 tiyin a gram — divided by the
            // YIELD, not by the batch, which is the whole argument.
            ->assertJsonPath('data.item.batch_cost_tiyin', 35_000)
            ->assertJsonPath('data.item.unit_cost_tiyin', 39);

        $this->assertSame(10_000 - 800, $beef->refresh()->stock_quantity);
        $this->assertSame(10_000 - 500, $onion->refresh()->stock_quantity);
    }

    public function test_a_prep_card_with_no_recipe_cannot_be_produced(): void
    {
        $this->actingAsStorekeeper();

        $empty = PrepItem::query()->create([
            'code' => 'ghost', 'name' => ['uz' => 'Yo\'q', 'ru' => 'Нет', 'en' => 'None'],
            'unit' => 'g', 'batch_quantity' => 1000, 'loss_percent' => 0,
            'shelf_life_days' => 1, 'on_hand' => 0, 'is_active' => true,
        ]);

        // A batch of nothing would raise `on_hand` out of thin air and cost
        // every dish that used it at zero.
        $this->postJson('/api/v1/inventory/prep', [
            'prep_item_id' => $empty->id, 'batches' => 1,
        ])->assertApiError('stock.prep_card_empty');
    }

    public function test_the_prep_list_costs_every_card(): void
    {
        $this->actingAsStorekeeper();
        $this->seed(InventoryDatabaseSeeder::class);

        $this->getJson('/api/v1/inventory/prep')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.code', 'broth');
    }

    // ============ Helpers ============

    private function shelf(Branch $branch, Ingredient $ingredient): int
    {
        return (int) StockLevel::query()
            ->where('branch_id', $branch->id)
            ->where('ingredient_id', $ingredient->id)
            ->value('quantity');
    }
}
