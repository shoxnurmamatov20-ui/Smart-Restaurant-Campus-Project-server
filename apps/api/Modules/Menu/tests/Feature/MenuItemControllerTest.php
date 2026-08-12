<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * Feature tests for the Menu item REST API.
 *
 * Covers: auth, RBAC, CRUD, validation, search/filters, the stop-list, and
 * tenant isolation — the behaviours every other module copies.
 */
final class MenuItemControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    /** The head chef owns the menu: full CRUD. */
    private function actingAsChef(): User
    {
        $user = User::factory()->create();
        $user->assignRole('chef');
        $this->actingAs($user);

        return $user;
    }

    /** A waiter may read the menu but never change it. */
    private function actingAsWaiter(): User
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        return $user;
    }

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        $category = MenuCategory::factory()->create();

        return array_merge([
            'menu_category_id' => $category->id,
            'sku' => 'OSH-001',
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
            'price' => 4500000,
            'cost_price' => 1420000,
            'cook_time_minutes' => 12,
            'station' => 'hot',
        ], $overrides);
    }

    // ============ Authentication & authorisation ============

    public function test_unauthenticated_user_cannot_list_items(): void
    {
        $this->getJson('/api/v1/menu/items')->assertStatus(401);
    }

    public function test_courier_without_menu_permission_is_forbidden(): void
    {
        $user = User::factory()->create();
        $user->assignRole('courier');
        $this->actingAs($user);

        $this->getJson('/api/v1/menu/items')->assertStatus(403);
    }

    public function test_waiter_can_read_but_cannot_create(): void
    {
        $this->actingAsWaiter();
        MenuItem::factory()->count(2)->create();

        $this->getJson('/api/v1/menu/items')->assertOk();
        $this->postJson('/api/v1/menu/items', $this->validPayload())->assertStatus(403);
    }

    // ============ Read ============

    public function test_chef_can_list_items(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->count(3)->create();

        $this->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure([
                'data' => [
                    ['id', 'sku', 'title', 'name', 'price', 'price_uzs', 'station', 'status', 'is_orderable'],
                ],
                'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            ]);
    }

    public function test_show_returns_single_item_with_category(): void
    {
        $this->actingAsChef();
        $item = MenuItem::factory()->create();

        $this->getJson("/api/v1/menu/items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $item->id)
            ->assertJsonPath('data.category.id', $item->menu_category_id);
    }

    public function test_title_resolves_to_the_request_locale(): void
    {
        $this->actingAsChef();
        $item = MenuItem::factory()->create([
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
        ]);

        // The request states its language; nothing is set out of band, because
        // in production the only thing that moves the locale is the request
        // itself. Full resolution rules live in tests/Feature/LocaleTest.php.
        $this->withHeader('X-Locale', 'ru')
            ->getJson("/api/v1/menu/items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Плов')
            ->assertJsonPath('data.name.uz', 'Osh');
    }

    // ============ Create ============

    public function test_chef_can_create_item(): void
    {
        $this->actingAsChef();

        $this->postJson('/api/v1/menu/items', $this->validPayload())
            ->assertCreated()
            ->assertJsonPath('data.sku', 'OSH-001')
            ->assertJsonPath('data.price', 4500000)
            ->assertJsonPath('data.price_uzs', 45000)
            ->assertJsonPath('data.title', 'Osh');

        $this->assertDatabaseHas('menu_items', [
            'sku' => 'OSH-001',
            'price' => 4500000,
            'status' => 'active',
        ]);
    }

    public function test_margin_percent_is_derived_from_cost_price(): void
    {
        $this->actingAsChef();

        // 45 000 so'm price, 14 200 so'm cost -> 68.4% margin
        $this->postJson('/api/v1/menu/items', $this->validPayload())
            ->assertCreated()
            ->assertJsonPath('data.margin_percent', 68.4);
    }

    // ============ Validation ============

    public function test_validation_rejects_duplicate_sku(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->create(['sku' => 'OSH-001']);

        $this->postJson('/api/v1/menu/items', $this->validPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors('sku');
    }

    public function test_validation_requires_uzbek_name(): void
    {
        $this->actingAsChef();

        $this->postJson('/api/v1/menu/items', $this->validPayload([
            'name' => ['ru' => 'Плов'],
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('name.uz');
    }

    public function test_validation_rejects_cost_price_above_menu_price(): void
    {
        $this->actingAsChef();

        $this->postJson('/api/v1/menu/items', $this->validPayload([
            'price' => 1000000,
            'cost_price' => 2000000,
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cost_price');
    }

    public function test_validation_rejects_unknown_station(): void
    {
        $this->actingAsChef();

        $this->postJson('/api/v1/menu/items', $this->validPayload([
            'station' => 'teleport',
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('station');
    }

    // ============ Update & delete ============

    public function test_chef_can_update_item_price(): void
    {
        $this->actingAsChef();
        $item = MenuItem::factory()->create(['price' => 4000000]);

        $this->patchJson("/api/v1/menu/items/{$item->id}", ['price' => 4800000])
            ->assertOk()
            ->assertJsonPath('data.price', 4800000);

        $this->assertDatabaseHas('menu_items', ['id' => $item->id, 'price' => 4800000]);
    }

    public function test_chef_can_soft_delete_item(): void
    {
        $this->actingAsChef();
        $item = MenuItem::factory()->create();

        $this->deleteJson("/api/v1/menu/items/{$item->id}")->assertNoContent();

        $this->assertSoftDeleted('menu_items', ['id' => $item->id]);
    }

    // ============ Stop-list ============

    public function test_item_can_be_put_on_the_stop_list(): void
    {
        $this->actingAsChef();
        $item = MenuItem::factory()->create();

        $this->postJson("/api/v1/menu/items/{$item->id}/stop")
            ->assertOk()
            ->assertJsonPath('data.is_available', false)
            ->assertJsonPath('data.is_orderable', false);

        $this->assertDatabaseHas('menu_items', ['id' => $item->id, 'is_available' => false]);
    }

    public function test_stopped_item_returns_automatically_after_its_deadline(): void
    {
        $this->actingAsChef();

        // Stopped, but the deadline has already passed — sellable again.
        $item = MenuItem::factory()->create([
            'is_available' => false,
            'stopped_until' => now()->subMinute(),
        ]);

        $this->getJson("/api/v1/menu/items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.is_available', false)
            ->assertJsonPath('data.is_orderable', true);
    }

    public function test_item_can_be_resumed(): void
    {
        $this->actingAsChef();
        $item = MenuItem::factory()->stopped()->create();

        $this->postJson("/api/v1/menu/items/{$item->id}/resume")
            ->assertOk()
            ->assertJsonPath('data.is_available', true);
    }

    public function test_orderable_filter_excludes_stopped_items(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->count(2)->create();
        MenuItem::factory()->stopped()->count(3)->create();

        $this->getJson('/api/v1/menu/items?filter[orderable]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Filters, search, pagination ============

    public function test_search_filter_finds_item_by_name(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->create(['sku' => 'A-1', 'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf']]);
        MenuItem::factory()->create(['sku' => 'B-1', 'name' => ['uz' => 'Manti', 'ru' => 'Манты', 'en' => 'Manti']]);

        $this->getJson('/api/v1/menu/items?filter[search]=osh')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sku', 'A-1');
    }

    public function test_filter_by_station(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->count(2)->create(['station' => 'grill']);
        MenuItem::factory()->count(3)->create(['station' => 'hot']);

        $this->getJson('/api/v1/menu/items?filter[station]=grill')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_sort_by_price_descending(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->create(['sku' => 'CHEAP', 'price' => 1000000]);
        MenuItem::factory()->create(['sku' => 'PRICEY', 'price' => 9000000]);

        $this->getJson('/api/v1/menu/items?sort=-price')
            ->assertOk()
            ->assertJsonPath('data.0.sku', 'PRICEY');
    }

    public function test_pagination_respects_per_page(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->count(30)->create();

        $this->getJson('/api/v1/menu/items?per_page=10')
            ->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('meta.total', 30);
    }

    // ============ Module info ============

    public function test_module_info_endpoint_returns_counts(): void
    {
        $this->actingAsChef();
        MenuItem::factory()->count(4)->create();
        MenuItem::factory()->stopped()->count(2)->create();

        $this->getJson('/api/v1/menu/')
            ->assertOk()
            ->assertJsonPath('module', 'Menu')
            ->assertJsonPath('counts.items_total', 6)
            ->assertJsonPath('counts.items_orderable', 4)
            ->assertJsonPath('counts.items_stopped', 2);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_menu(): void
    {
        $osh = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi',
            'country_code' => 'UZ', 'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $cafe = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe',
            'country_code' => 'UZ', 'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $category = MenuCategory::factory()->create(['tenant_id' => $osh->id]);
        MenuItem::factory()->count(3)->create([
            'tenant_id' => $osh->id,
            'menu_category_id' => $category->id,
        ]);

        $user = User::factory()->create(['tenant_id' => $osh->id]);
        $user->assignRole('chef');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/menu/items')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}
