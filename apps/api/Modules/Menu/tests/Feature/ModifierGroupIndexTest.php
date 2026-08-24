<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;
use Tests\TestCase;

/**
 * The staff-facing list of modifier groups.
 *
 * The console's Modifiers tab drew three groups out of a fixture file — "Ulush ·
 * used by 24 dishes" — over restaurants that had never priced a portion that
 * way, because no read existed. These are the four things that read has to get
 * right: it exists, it counts, it refuses, and it never crosses a restaurant.
 */
final class ModifierGroupIndexTest extends TestCase
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

    private function group(string $name, int $min, int $max): ModifierGroup
    {
        $group = ModifierGroup::query()->create([
            'name' => ['uz' => $name, 'ru' => $name, 'en' => $name],
            'is_multi' => $max > 1,
            'min_choices' => $min,
            'max_choices' => $max,
            'sort' => 0,
            'is_active' => true,
        ]);

        ModifierOption::query()->create([
            'modifier_group_id' => $group->id,
            'name' => ['uz' => 'Kattalashtirilgan', 'ru' => 'Большая', 'en' => 'Large'],
            'price_delta' => 18_000_00,
            'sort' => 0,
            'is_active' => true,
        ]);

        return $group;
    }

    public function test_a_stranger_cannot_read_the_sheets(): void
    {
        $this->getJson('/api/v1/menu/modifier-groups')->assertStatus(401);
    }

    public function test_the_list_carries_the_rules_the_options_and_the_usage_count(): void
    {
        $this->actingAsChef();
        $group = $this->group('Ulush', 1, 1);

        // Two dishes ask the question; the console draws that number and a
        // manager decides whether the sheet is still earning its place.
        /*
         * `tenant_id` in the pivot attributes, explicitly — the same note
         * `MenuModifierSeeder` carries. A pivot row is not a model, so
         * BelongsToTenant does not stamp it, and row-level security then hides
         * every attachment: the dish has its groups in the table and the API
         * answers "used by nobody". A test that attached the easy way would
         * have asserted exactly the bug.
         */
        MenuItem::factory()->count(2)->create()->each(
            static fn (MenuItem $item) => $item->modifierGroups()->attach(
                $group->id,
                ['tenant_id' => $item->tenant_id],
            ),
        );

        $this->getJson('/api/v1/menu/modifier-groups')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Ulush')
            ->assertJsonPath('data.0.min_choices', 1)
            ->assertJsonPath('data.0.max_choices', 1)
            ->assertJsonPath('data.0.used_by', 2)
            ->assertJsonPath('data.0.choices.0.price_delta_tiyin', 18_000_00);
    }

    public function test_a_group_nobody_uses_is_listed_with_a_zero_rather_than_hidden(): void
    {
        $this->actingAsChef();
        $this->group('Tayyorlash', 0, 3);

        // A sheet written and forgotten is exactly the row somebody opens this
        // tab to find. Filtering it out would make it look deleted.
        $this->getJson('/api/v1/menu/modifier-groups')
            ->assertOk()
            ->assertJsonPath('data.0.used_by', 0);
    }

    public function test_a_switched_off_group_is_listed_and_says_so(): void
    {
        $this->actingAsChef();
        $group = $this->group('Qo\'shimchalar', 0, 4);
        $group->forceFill(['is_active' => false])->save();

        $this->getJson('/api/v1/menu/modifier-groups')
            ->assertOk()
            ->assertJsonPath('data.0.is_active', false);
    }

    public function test_a_reader_without_the_permission_is_refused(): void
    {
        $user = User::factory()->create();
        // A courier holds no menu permission at all.
        $user->assignRole('courier');
        $this->actingAs($user);

        $this->getJson('/api/v1/menu/modifier-groups')->assertStatus(403);
    }

    public function test_another_restaurants_sheets_are_invisible(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-modifier', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        $this->group('Begona', 0, 2);
        app(TenantContext::class)->clear();

        $this->actingAsChef();

        $this->getJson('/api/v1/menu/modifier-groups')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
