<?php

declare(strict_types=1);

namespace Modules\Inventory\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\PrepItem;
use Tests\TestCase;

/**
 * Creating a prep card — the act `POST /v1/inventory/prep` is not.
 *
 * That one produces a batch of a card that already exists, and the route said
 * so in as many words while the console's "new prep item" button flashed a hint
 * and opened nothing. The stakes differ: a batch moves stock and can be
 * corrected with a write-off, while a wrong card silently changes what every
 * dish containing it costs, on every report, until somebody notices the margin.
 */
final class PrepItemCreationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi-prep', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsStorekeeper(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        return $user;
    }

    private ?Ingredient $beef = null;

    /**
     * The one ingredient every card here is made of.
     *
     * Memoised because `payload()` reaches for it and several tests build a
     * payload twice; the SKU is unique per restaurant, so a second create is a
     * constraint violation rather than a second product.
     */
    private function beef(int $costPerUnit = 10): Ingredient
    {
        return $this->beef ??= Ingredient::factory()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'ING-BEEF',
            'unit' => 'g',
            'cost_per_unit' => $costPerUnit,
        ]);
    }

    /** @param array<string, mixed> $overrides */
    private function payload(array $overrides = []): array
    {
        return array_replace([
            'code' => 'zirvak',
            'name' => ['uz' => 'Zirvak', 'ru' => 'Зирвак', 'en' => 'Zirvak'],
            'unit' => 'g',
            'batch_quantity' => 1000,
            'loss_percent' => 20,
            'shelf_life_days' => 2,
            'components' => [['ingredient_id' => $this->beef()->id, 'quantity' => 400]],
        ], $overrides);
    }

    public function test_a_card_is_created_with_its_components_and_costed(): void
    {
        $this->actingAsStorekeeper();

        // 400 g of beef at 10 tiyin = 4 000 a batch. 20% boils away, so 800
        // usable grams cost 4 000 — 5 tiyin a gram.
        $this->postJson('/api/v1/inventory/prep-items', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.code', 'zirvak')
            ->assertJsonPath('data.yield', 800)
            ->assertJsonPath('data.batch_cost_tiyin', 4000)
            ->assertJsonPath('data.unit_cost_tiyin', 5)
            // Stock arrives by being received or produced, both of which write
            // a movement. A starting balance typed into a form is stock the
            // ledger has never heard of.
            ->assertJsonPath('data.on_hand', 0);

        $this->assertDatabaseHas('prep_items', ['code' => 'zirvak', 'tenant_id' => $this->tenant->id]);
    }

    public function test_a_card_with_no_components_is_refused(): void
    {
        $this->actingAsStorekeeper();

        // `produce()` refuses such a card with `stock.prep_card_empty`, so
        // accepting one would be accepting a row whose only possible future is
        // an error message.
        $this->postJson('/api/v1/inventory/prep-items', $this->payload(['components' => []]))
            ->assertStatus(422)
            ->assertApiValidationErrors('components');

        $this->assertSame(0, PrepItem::query()->count());
    }

    public function test_the_same_ingredient_listed_twice_is_summed_rather_than_refused(): void
    {
        $this->actingAsStorekeeper();
        $beef = $this->beef();

        $this->postJson('/api/v1/inventory/prep-items', $this->payload([
            'components' => [
                ['ingredient_id' => $beef->id, 'quantity' => 250],
                ['ingredient_id' => $beef->id, 'quantity' => 150],
            ],
        ]))
            ->assertCreated()
            ->assertJsonCount(1, 'data.components')
            ->assertJsonPath('data.components.0.quantity', 400);
    }

    public function test_a_total_loss_card_is_refused(): void
    {
        $this->actingAsStorekeeper();

        // 100% loss is a typo. The yield divides the batch cost, so the card
        // would make every dish containing it absurdly expensive.
        $this->postJson('/api/v1/inventory/prep-items', $this->payload(['loss_percent' => 100]))
            ->assertStatus(422)
            ->assertApiValidationErrors('loss_percent');
    }

    public function test_two_cards_cannot_share_a_code(): void
    {
        $this->actingAsStorekeeper();
        $this->postJson('/api/v1/inventory/prep-items', $this->payload())->assertCreated();

        $this->postJson('/api/v1/inventory/prep-items', $this->payload())
            ->assertStatus(422)
            ->assertApiValidationErrors('code');
    }

    public function test_a_reader_who_may_only_update_stock_cannot_write_a_card(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        // A chef may stop a dish and read the shelf; creating a costing card is
        // a heavier act than either.
        $user->assignRole('chef');
        $this->actingAs($user);

        $this->postJson('/api/v1/inventory/prep-items', $this->payload())->assertStatus(403);
    }

    public function test_a_component_belonging_to_another_restaurant_is_refused(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-prep', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        $theirBeef = Ingredient::factory()->create(['tenant_id' => $other->id, 'sku' => 'ING-THEIRS']);
        app(TenantContext::class)->set($this->tenant);

        $this->actingAsStorekeeper();

        // The `exists` rule runs on a connection focused on the asker, so
        // another restaurant's shelf simply is not there.
        $this->postJson('/api/v1/inventory/prep-items', $this->payload([
            'components' => [['ingredient_id' => $theirBeef->id, 'quantity' => 100]],
        ]))->assertStatus(422);
    }
}
