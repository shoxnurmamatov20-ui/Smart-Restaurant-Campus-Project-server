<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\PrepComponent;
use Modules\Inventory\Models\PrepItem;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\RecipeLine;
use Tests\TestCase;

/**
 * A dish's technical card, costed against what the shelf costs today.
 *
 * The figures below are arithmetic somebody can check by hand, deliberately:
 * this endpoint is where the platform's food-cost number stops being something
 * a person typed into `menu_items.cost_price` and starts being the sum of what
 * the dish is made of. A test asserting shapes rather than money would not have
 * caught the two mistakes that matter — costing prep against the batch instead
 * of the yield, and quietly pricing a missing ingredient at nothing.
 */
final class RecipeCardTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi-recipe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsChef(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('chef');
        $this->actingAs($user);

        return $user;
    }

    private function ingredient(string $sku, int $costPerUnit): Ingredient
    {
        return Ingredient::factory()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => $sku,
            'unit' => 'g',
            'cost_per_unit' => $costPerUnit,
        ]);
    }

    public function test_a_stranger_cannot_read_a_card(): void
    {
        $item = MenuItem::factory()->create(['tenant_id' => $this->tenant->id]);

        $this->getJson("/api/v1/menu/items/{$item->id}/recipe")->assertStatus(401);
    }

    public function test_a_card_is_costed_from_its_lines_and_not_from_the_stored_column(): void
    {
        $this->actingAsChef();

        // 45 000 so'm on the menu, and a `cost_price` column that says
        // something else — which is the number the whole platform used to quote.
        $dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'price' => 45_000_00,
            'cost_price' => 99_999_00,
        ]);

        // 200 g of rice at 3 tiyin a gram = 600 tiyin; 40 g of onion at 1 = 40.
        $rice = $this->ingredient('ING-RICE', 3);
        $onion = $this->ingredient('ING-ONION', 1);

        RecipeLine::factory()->create([
            'tenant_id' => $this->tenant->id, 'menu_item_id' => $dish->id,
            'ingredient_id' => $rice->id, 'quantity' => 200, 'sort' => 10,
        ]);
        RecipeLine::factory()->create([
            'tenant_id' => $this->tenant->id, 'menu_item_id' => $dish->id,
            'ingredient_id' => $onion->id, 'quantity' => 40, 'sort' => 20,
        ]);

        $this->getJson("/api/v1/menu/items/{$dish->id}/recipe")
            ->assertOk()
            ->assertJsonPath('data.cost_tiyin', 640)
            ->assertJsonPath('data.sell_tiyin', 45_000_00)
            ->assertJsonPath('data.lines.0.name', $rice->name)
            ->assertJsonPath('data.lines.0.line_cost_tiyin', 600)
            ->assertJsonPath('data.lines.1.line_cost_tiyin', 40)
            // 640 of 4 500 000 rounds to nothing, which is what a two-line
            // fixture costs — the point is that the stored 99 999 00 is gone.
            ->assertJsonPath('data.food_cost_percent', 0);
    }

    public function test_a_prep_line_is_costed_against_the_yield_and_not_the_batch(): void
    {
        $this->actingAsChef();

        $beef = $this->ingredient('ING-BEEF', 10);

        // 100 g of beef at 10 tiyin = 1 000 tiyin a batch. The batch is 100 g
        // and 20% of it boils away, so 80 usable grams cost 1 000 — 12 tiyin a
        // gram, not 10. Costing against the batch would understate every dish.
        $zirvak = PrepItem::query()->create([
            'tenant_id' => $this->tenant->id, 'code' => 'zirvak',
            'name' => ['uz' => 'Zirvak'], 'unit' => 'g',
            'batch_quantity' => 100, 'loss_percent' => 20,
            'shelf_life_days' => 2, 'on_hand' => 0, 'is_active' => true,
        ]);
        PrepComponent::query()->create([
            'tenant_id' => $this->tenant->id, 'prep_item_id' => $zirvak->id,
            'ingredient_id' => $beef->id, 'quantity' => 100,
        ]);

        $dish = MenuItem::factory()->create(['tenant_id' => $this->tenant->id, 'price' => 10_000_00]);

        RecipeLine::factory()->prep($zirvak->id)->create([
            'tenant_id' => $this->tenant->id, 'menu_item_id' => $dish->id, 'quantity' => 10,
        ]);

        $this->getJson("/api/v1/menu/items/{$dish->id}/recipe")
            ->assertOk()
            ->assertJsonPath('data.lines.0.kind', 'prep')
            ->assertJsonPath('data.lines.0.unit_cost_tiyin', 12)
            ->assertJsonPath('data.lines.0.line_cost_tiyin', 120)
            ->assertJsonPath('data.cost_tiyin', 120);
    }

    public function test_a_line_whose_component_has_gone_leaves_the_card_uncosted(): void
    {
        $this->actingAsChef();
        $dish = MenuItem::factory()->create(['tenant_id' => $this->tenant->id, 'price' => 10_000_00]);

        // An ingredient id nothing resolves — deleted after the card was
        // written. A partial total is worse than none: it looks like a food
        // cost and is guaranteed too low, which is the direction that makes a
        // dish look worth keeping.
        RecipeLine::factory()->create([
            'tenant_id' => $this->tenant->id, 'menu_item_id' => $dish->id,
            'ingredient_id' => 987_654, 'quantity' => 50,
        ]);

        $this->getJson("/api/v1/menu/items/{$dish->id}/recipe")
            ->assertOk()
            ->assertJsonPath('data.unresolved_lines', 1)
            ->assertJsonPath('data.cost_tiyin', null)
            ->assertJsonPath('data.margin_percent', null)
            ->assertJsonPath('data.lines.0.name', null);
    }

    public function test_the_index_lists_only_dishes_that_have_a_card(): void
    {
        $this->actingAsChef();

        $costed = MenuItem::factory()->create(['tenant_id' => $this->tenant->id, 'price' => 10_000_00]);
        MenuItem::factory()->create(['tenant_id' => $this->tenant->id, 'price' => 20_000_00]);

        RecipeLine::factory()->create([
            'tenant_id' => $this->tenant->id, 'menu_item_id' => $costed->id,
            'ingredient_id' => $this->ingredient('ING-OIL', 2)->id, 'quantity' => 10,
        ]);

        // Eighty dishes with four costed should answer four rows, not eighty
        // with seventy-six empty ones — the screen is a list somebody picks
        // from, and padding it buries the cards that exist.
        $this->getJson('/api/v1/menu/recipes')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.menu_item_id', $costed->id);
    }

    public function test_a_reader_without_the_permission_is_refused(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('courier');
        $this->actingAs($user);

        $this->getJson('/api/v1/menu/recipes')->assertStatus(403);
    }

    public function test_another_restaurants_card_is_not_readable(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-recipe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        $theirs = MenuItem::factory()->create(['tenant_id' => $other->id, 'price' => 10_000_00]);
        RecipeLine::factory()->create([
            'tenant_id' => $other->id, 'menu_item_id' => $theirs->id,
            'ingredient_id' => 1, 'quantity' => 10,
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->actingAsChef();

        // Route-model binding runs after ResolveTenant, so another
        // restaurant's dish is not found rather than read.
        $this->getJson("/api/v1/menu/items/{$theirs->id}/recipe")->assertStatus(404);
        $this->getJson('/api/v1/menu/recipes')->assertOk()->assertJsonCount(0, 'data');
    }
}
