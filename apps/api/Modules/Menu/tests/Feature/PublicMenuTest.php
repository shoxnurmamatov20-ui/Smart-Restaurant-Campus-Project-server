<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The QR-code menu a guest opens at the table.
 *
 * No login — the restaurant comes from the tenant header/subdomain. The whole
 * point of these tests is that a guest can never be shown something that is not
 * actually for sale.
 */
final class PublicMenuTest extends TestCase
{
    use RefreshDatabase;

    private function restaurant(string $slug = 'osh-markazi'): Tenant
    {
        return Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => $slug,
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    public function test_public_menu_requires_a_restaurant(): void
    {
        $this->getJson('/api/v1/public/menu')
            ->assertStatus(400)
            ->assertJsonPath('code', 'TENANT_REQUIRED');
    }

    public function test_guest_sees_active_sections_and_sellable_items(): void
    {
        $tenant = $this->restaurant();

        $category = MenuCategory::factory()->create([
            'tenant_id' => $tenant->id,
            'slug' => 'milliy-taomlar',
        ]);

        MenuItem::factory()->count(2)->create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
        ]);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonPath('restaurant.slug', 'osh-markazi')
            ->assertJsonPath('channel', 'dine_in')
            ->assertJsonCount(1, 'data')
            ->assertJsonCount(2, 'data.0.items');
    }

    public function test_guest_never_sees_stopped_draft_or_archived_items(): void
    {
        $tenant = $this->restaurant();
        $category = MenuCategory::factory()->create(['tenant_id' => $tenant->id]);

        $base = ['tenant_id' => $tenant->id, 'menu_category_id' => $category->id];

        MenuItem::factory()->create($base);                        // sellable
        MenuItem::factory()->stopped()->create($base);             // on the stop-list
        MenuItem::factory()->draft()->create($base);               // not published
        MenuItem::factory()->archived()->create($base);            // retired

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.items');
    }

    public function test_inactive_sections_are_hidden(): void
    {
        $tenant = $this->restaurant();
        MenuCategory::factory()->inactive()->create(['tenant_id' => $tenant->id]);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_menu_of_one_restaurant_is_invisible_to_another(): void
    {
        $osh = $this->restaurant('osh-markazi');
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe',
            'country_code' => 'UZ', 'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $category = MenuCategory::factory()->create(['tenant_id' => $osh->id]);
        MenuItem::factory()->count(3)->create([
            'tenant_id' => $osh->id,
            'menu_category_id' => $category->id,
        ]);

        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
