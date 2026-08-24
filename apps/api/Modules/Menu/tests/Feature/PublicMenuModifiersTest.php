<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;
use Tests\TestCase;

/**
 * The questions a guest is asked, on the menu a guest reads.
 *
 * `GET /v1/pos/menu/{item}/questions` has answered these for the till since P4;
 * `GET /v1/public/menu` did not carry them at all, so the guest dish sheet drew
 * a fixture — a hard-coded list of sizes and extras that belonged to no
 * restaurant. A guest picking "katta" from it was picking from a menu nobody
 * had priced.
 *
 * The shape is the till's, field for field, and these tests are what keeps it
 * that way.
 */
final class PublicMenuModifiersTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private MenuItem $dish;

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

        $category = MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id,
            'slug' => 'milliy-taomlar',
        ]);

        $this->dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
            'sku' => 'OSH-001',
        ]);
    }

    private function group(string $uz, bool $multi, int $min, int $max, bool $active = true): ModifierGroup
    {
        $group = ModifierGroup::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => ['uz' => $uz, 'ru' => $uz, 'en' => $uz],
            'is_multi' => $multi,
            'min_choices' => $min,
            'max_choices' => $max,
            'sort' => 10,
            'is_active' => $active,
        ]);

        // `tenant_id` on the pivot as well as on the rows: the join table is
        // behind row-level security too, and a null there is a link the request
        // that reads the menu cannot see.
        $this->dish->modifierGroups()->attach($group->id, ['sort' => 10, 'tenant_id' => $this->tenant->id]);

        return $group;
    }

    private function option(ModifierGroup $group, string $uz, int $delta, bool $active = true): ModifierOption
    {
        return ModifierOption::query()->create([
            'tenant_id' => $this->tenant->id,
            'modifier_group_id' => $group->id,
            'name' => ['uz' => $uz, 'ru' => $uz, 'en' => $uz],
            'price_delta' => $delta,
            'sort' => 10,
            'is_active' => $active,
        ]);
    }

    private function menu(): TestResponse
    {
        return $this->withHeader('X-Tenant', 'osh-markazi')->getJson('/api/v1/public/menu');
    }

    public function test_the_guest_menu_carries_the_questions_and_their_rules(): void
    {
        $size = $this->group('Hajmi', multi: false, min: 1, max: 1);
        $this->option($size, "O'rtacha", 0);
        $this->option($size, 'Katta', 1_500_000);

        $response = $this->menu()->assertOk();

        $response->assertJsonCount(1, 'data.0.items.0.modifier_groups');
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.title', 'Hajmi');
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.is_multi', false);
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.min_choices', 1);
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.max_choices', 1);

        $response->assertJsonCount(2, 'data.0.items.0.modifier_groups.0.choices');
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.choices.1.title', 'Katta');
        // Tiyin, and signed — the key is the till's, so a phone and a receipt
        // cannot read the same surcharge out of two differently named fields.
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.choices.1.price_delta_tiyin', 1_500_000);
    }

    public function test_a_dish_nobody_is_asked_anything_about_carries_an_empty_list(): void
    {
        // Empty rather than absent: the sheet is opened only when the list is
        // non-empty, so "no questions" and "straight into the basket" are the
        // same answer and need no second key to tell apart.
        $this->menu()->assertOk()->assertJsonCount(0, 'data.0.items.0.modifier_groups');
    }

    public function test_a_switched_off_group_or_choice_is_never_offered(): void
    {
        $retired = $this->group('Eski savol', multi: false, min: 0, max: 1, active: false);
        $this->option($retired, 'Eski javob', 0);

        $extras = $this->group("Qo'shimchalar", multi: true, min: 0, max: 3);
        $this->option($extras, 'Qatiq', 500_000);
        $this->option($extras, 'Tugagan qo\'shimcha', 500_000, active: false);

        $response = $this->menu()->assertOk();

        $response->assertJsonCount(1, 'data.0.items.0.modifier_groups');
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.title', "Qo'shimchalar");
        $response->assertJsonCount(1, 'data.0.items.0.modifier_groups.0.choices');
        $response->assertJsonPath('data.0.items.0.modifier_groups.0.choices.0.title', 'Qatiq');
    }

    public function test_the_questions_are_resolved_into_the_readers_language(): void
    {
        $group = ModifierGroup::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => ['uz' => 'Hajmi', 'ru' => 'Размер', 'en' => 'Size'],
            'is_multi' => false,
            'min_choices' => 1,
            'max_choices' => 1,
            'sort' => 10,
            'is_active' => true,
        ]);
        $this->dish->modifierGroups()->attach($group->id, ['sort' => 10, 'tenant_id' => $this->tenant->id]);

        ModifierOption::query()->create([
            'tenant_id' => $this->tenant->id,
            'modifier_group_id' => $group->id,
            'name' => ['uz' => 'Katta', 'ru' => 'Большая', 'en' => 'Large'],
            'price_delta' => 0,
            'sort' => 10,
            'is_active' => true,
        ]);

        $this->withHeaders(['X-Tenant' => 'osh-markazi', 'X-Locale' => 'ru'])
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonPath('data.0.items.0.modifier_groups.0.title', 'Размер')
            ->assertJsonPath('data.0.items.0.modifier_groups.0.choices.0.title', 'Большая');
    }

    public function test_another_restaurants_questions_are_not_on_this_menu(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe',
            'slug' => 'city-cafe',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $category = MenuCategory::factory()->create(['tenant_id' => $other->id]);
        MenuItem::factory()->create([
            'tenant_id' => $other->id,
            'menu_category_id' => $category->id,
            'sku' => 'CAF-001',
        ]);

        $size = $this->group('Hajmi', multi: false, min: 1, max: 1);
        $this->option($size, 'Katta', 1_500_000);

        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonPath('data.0.items.0.sku', 'CAF-001')
            ->assertJsonCount(0, 'data.0.items.0.modifier_groups');
    }
}
