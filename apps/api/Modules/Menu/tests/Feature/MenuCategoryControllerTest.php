<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

final class MenuCategoryControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsChef(): User
    {
        $user = User::factory()->create();
        $user->assignRole('chef');
        $this->actingAs($user);

        return $user;
    }

    public function test_unauthenticated_user_cannot_list_categories(): void
    {
        $this->getJson('/api/v1/menu/categories')->assertStatus(401);
    }

    public function test_chef_can_list_categories_with_item_counts(): void
    {
        $this->actingAsChef();
        $category = MenuCategory::factory()->create();
        MenuItem::factory()->count(3)->inCategory($category)->create();

        $this->getJson('/api/v1/menu/categories')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.items_count', 3);
    }

    public function test_chef_can_create_category(): void
    {
        $this->actingAsChef();

        $this->postJson('/api/v1/menu/categories', [
            'slug' => 'salatlar',
            'name' => ['uz' => 'Salatlar', 'ru' => 'Салаты', 'en' => 'Salads'],
            'icon' => 'salad',
            'sort_order' => 20,
        ])
            ->assertCreated()
            ->assertJsonPath('data.slug', 'salatlar')
            ->assertJsonPath('data.title', 'Salatlar');

        $this->assertDatabaseHas('menu_categories', ['slug' => 'salatlar']);
    }

    public function test_validation_rejects_non_slug_characters(): void
    {
        $this->actingAsChef();

        $this->postJson('/api/v1/menu/categories', [
            'slug' => 'Issiq Taomlar!',
            'name' => ['uz' => 'Issiq taomlar'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slug');
    }

    public function test_validation_rejects_duplicate_slug(): void
    {
        $this->actingAsChef();
        MenuCategory::factory()->create(['slug' => 'salatlar']);

        $this->postJson('/api/v1/menu/categories', [
            'slug' => 'salatlar',
            'name' => ['uz' => 'Salatlar'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slug');
    }

    public function test_category_cannot_be_its_own_parent(): void
    {
        $this->actingAsChef();
        $category = MenuCategory::factory()->create();

        $this->patchJson("/api/v1/menu/categories/{$category->id}", [
            'parent_id' => $category->id,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_root_filter_returns_only_top_level_sections(): void
    {
        $this->actingAsChef();
        $parent = MenuCategory::factory()->create();
        MenuCategory::factory()->count(2)->childOf($parent)->create();

        $this->getJson('/api/v1/menu/categories?filter[root]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $parent->id);
    }

    public function test_chef_can_soft_delete_category(): void
    {
        $this->actingAsChef();
        $category = MenuCategory::factory()->create();

        $this->deleteJson("/api/v1/menu/categories/{$category->id}")->assertNoContent();

        $this->assertSoftDeleted('menu_categories', ['id' => $category->id]);
    }
}
