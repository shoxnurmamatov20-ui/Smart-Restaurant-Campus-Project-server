<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\UnavailableMenuCatalog;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * How long the food takes, asked across the module boundary.
 *
 * Orders quotes a guest an ETA from a basket of ids. It may not import
 * `Modules\Menu\Models\MenuItem` to read one smallint — that is the rule
 * `ModuleBoundaryTest` enforces — so the catalogue contract answers instead.
 *
 * The interesting case is the one that is not a lookup: an id this restaurant
 * does not have. Zero would be the natural return and it is the one wrong
 * answer that cannot be told apart from a right one, because on a tracking
 * screen it reads as "your food is ready".
 */
final class PrepMinutesContractTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => 'osh-markazi',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
    }

    private function dish(int $cookTimeMinutes): MenuItem
    {
        $category = MenuCategory::factory()->create(['tenant_id' => $this->tenant->id]);

        return MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
            'cook_time_minutes' => $cookTimeMinutes,
        ]);
    }

    public function test_it_answers_the_dishes_own_cook_time(): void
    {
        $dish = $this->dish(35);

        $this->assertSame(35, app(MenuCatalog::class)->prepMinutes($dish->id));
    }

    public function test_a_dish_this_restaurant_does_not_have_gets_the_house_default(): void
    {
        config()->set('menu.default_prep_minutes', 18);

        $this->assertSame(18, app(MenuCatalog::class)->prepMinutes(999_999));
    }

    public function test_a_dish_saved_with_no_cook_time_gets_the_house_default(): void
    {
        config()->set('menu.default_prep_minutes', 18);
        $dish = $this->dish(0);

        // Never zero. "Ready immediately" is a sentence a tracking screen shows
        // a guest, and a dish nobody costed is not one.
        $this->assertSame(18, app(MenuCatalog::class)->prepMinutes($dish->id));
    }

    public function test_another_restaurants_dish_is_unknown_rather_than_readable(): void
    {
        $dish = $this->dish(35);

        $other = Tenant::query()->create([
            'name' => 'City Cafe',
            'slug' => 'city-cafe',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
        app(TenantContext::class)->set($other);

        config()->set('menu.default_prep_minutes', 18);

        $this->assertSame(18, app(MenuCatalog::class)->prepMinutes($dish->id));
    }

    public function test_the_catalogue_still_answers_when_the_menu_module_is_off(): void
    {
        config()->set('menu.default_prep_minutes', 18);

        // A read, so it answers rather than throws — the same rule every other
        // read on this fallback follows.
        $this->assertSame(18, (new UnavailableMenuCatalog)->prepMinutes(1));
    }
}
