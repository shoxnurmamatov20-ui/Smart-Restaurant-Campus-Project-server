<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The menu a restaurant starts with, written on its behalf.
 *
 * The console's starter-template button downloaded nothing and posted nothing
 * for as long as it existed. The two properties that make its replacement safe
 * are the ones below: it writes a menu, and pressing it twice does not restore
 * a price somebody has just corrected.
 */
final class StarterMenuTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Yangi Oshxona', 'slug' => 'yangi-oshxona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    public function test_an_empty_restaurant_gets_a_menu(): void
    {
        $this->actingAsOwner();

        $response = $this->postJson('/api/v1/menu/seed-template')->assertCreated();

        $categories = (int) $response->json('data.categories_created');
        $items = (int) $response->json('data.items_created');

        $this->assertGreaterThan(0, $categories);
        $this->assertGreaterThan(0, $items);
        $this->assertSame($categories, MenuCategory::query()->count());
        $this->assertSame($items, MenuItem::query()->count());
    }

    public function test_pressing_it_twice_writes_nothing_and_says_so(): void
    {
        $this->actingAsOwner();
        $this->postJson('/api/v1/menu/seed-template')->assertCreated();

        $before = MenuItem::query()->count();

        $second = $this->postJson('/api/v1/menu/seed-template')->assertCreated();

        $this->assertSame(0, (int) $second->json('data.items_created'));
        $this->assertSame(0, (int) $second->json('data.categories_created'));
        $this->assertGreaterThan(0, (int) $second->json('data.skipped'));
        $this->assertSame($before, MenuItem::query()->count());
    }

    public function test_a_price_somebody_corrected_is_not_restored(): void
    {
        $this->actingAsOwner();
        $this->postJson('/api/v1/menu/seed-template')->assertCreated();

        /** @var MenuItem $dish */
        $dish = MenuItem::query()->firstOrFail();
        $dish->forceFill(['price' => 1_00])->save();

        // Idempotent by SKIPPING, not by overwriting. A second press that
        // restored the template's price would be the button undoing somebody's
        // work — which is what makes a setup wizard unsafe to press.
        $this->postJson('/api/v1/menu/seed-template')->assertCreated();

        $this->assertSame(1_00, $dish->refresh()->price);
    }

    public function test_a_reader_who_may_not_create_dishes_is_refused(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        // A waiter reads the menu and may not write it.
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->postJson('/api/v1/menu/seed-template')->assertStatus(403);
        $this->assertSame(0, MenuItem::query()->count());
    }

    public function test_the_template_lands_in_the_asking_restaurant_only(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-template', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->actingAsOwner();
        $this->postJson('/api/v1/menu/seed-template')->assertCreated();

        app(TenantContext::class)->set($other);

        $this->assertSame(0, MenuItem::query()->count());
    }
}
