<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Modules\ModuleRegistry;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The capability manifest.
 *
 * Two things are being protected here. First, that every client can build its
 * navigation from one source of truth instead of hard-coding a module list.
 * Second — and this is the part that matters — that switching a module off
 * actually closes its routes, rather than merely hiding a sidebar entry while
 * the data stays one URL away.
 */
final class ModuleRegistryTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => 'osh-markazi',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth ============

    public function test_the_manifest_is_not_public(): void
    {
        $this->getJson('/api/v1/modules')->assertStatus(401);
    }

    // ============ Shape ============

    public function test_every_shipped_module_is_listed(): void
    {
        $this->signIn('owner');

        $response = $this->getJson('/api/v1/modules')->assertOk();

        $keys = collect($response->json('data'))->pluck('key')->all();

        // Derived from the registry, not written out: adding a twelfth module
        // should not mean editing a test that has nothing to do with it. The
        // Phase-1 ten are asserted explicitly below, in order.
        $this->assertSame(
            app(ModuleRegistry::class)->all()->keys()->all(),
            $keys,
            'The endpoint and the registry disagree about which modules exist.',
        );

        foreach (['menu', 'orders', 'kitchen', 'tables', 'inventory',
            'suppliers', 'staff', 'finance', 'crm', 'analytics', 'telegrambots'] as $expected) {
            $this->assertContains($expected, $keys);
        }

        // Sidebar order: Menu first, because that is where a restaurant starts.
        $this->assertSame('menu', $keys[0]);
    }

    public function test_a_module_describes_itself_completely(): void
    {
        $this->signIn('owner');

        $this->getJson('/api/v1/modules')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'menu')
            ->assertJsonPath('data.0.name', 'Menu')
            ->assertJsonPath('data.0.title', 'Menyu')
            ->assertJsonPath('data.0.labels.ru', 'Меню')
            ->assertJsonPath('data.0.icon', 'utensils')
            ->assertJsonPath('data.0.group', 'operations')
            ->assertJsonPath('data.0.route', 'api/v1/menu')
            ->assertJsonPath('data.0.available', true)
            ->assertJsonPath('data.0.required', true);
    }

    public function test_module_titles_follow_the_request_locale(): void
    {
        $this->signIn('owner');

        $this->withHeader('X-Locale', 'ru')
            ->getJson('/api/v1/modules')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Меню')
            ->assertJsonPath('meta.locale', 'ru');
    }

    public function test_the_permission_prefix_can_differ_from_the_module_key(): void
    {
        $this->signIn('owner');

        // The module is `telegrambots` but its permissions were seeded as
        // `telegram.*` — the manifest has to report what actually exists.
        $telegram = collect($this->getJson('/api/v1/modules')->json('data'))
            ->firstWhere('key', 'telegrambots');

        $this->assertContains('telegram.view', $telegram['permissions']);
    }

    // ============ Per-person capability ============

    public function test_a_waiter_sees_the_floor_not_the_books(): void
    {
        $this->signIn('waiter');

        $modules = collect($this->getJson('/api/v1/modules')->assertOk()->json('data'))
            ->keyBy('key');

        $this->assertTrue($modules['orders']['can_access'], 'A waiter must be able to take orders.');
        $this->assertFalse($modules['finance']['can_access'], 'A waiter must not reach the till.');
        $this->assertFalse($modules['analytics']['can_access'], 'A waiter must not read the business numbers.');
    }

    public function test_the_manifest_lists_only_the_verbs_this_person_holds(): void
    {
        $this->signIn('waiter');

        $menu = collect($this->getJson('/api/v1/modules')->json('data'))->firstWhere('key', 'menu');

        // A waiter reads the menu but never reprices it.
        $this->assertSame(['menu.view'], $menu['permissions']);
    }

    public function test_an_owner_reaches_every_module(): void
    {
        $this->signIn('owner');

        $response = $this->getJson('/api/v1/modules')->assertOk();
        $shipped = app(ModuleRegistry::class)->all()->count();

        // Whatever ships, an owner reaches all of it.
        $this->assertSame($shipped, $response->json('meta.total'));
        $this->assertSame($shipped, $response->json('meta.available'));
        $this->assertSame($shipped, $response->json('meta.accessible'));
    }

    // ============ Switching a module off ============

    public function test_an_owner_can_switch_an_optional_module_off(): void
    {
        $this->signIn('owner');

        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.key', 'tables')
            ->assertJsonPath('data.enabled_for_restaurant', false)
            ->assertJsonPath('data.available', false);

        $this->assertFalse($this->tenant->refresh()->setting('modules.tables'));
    }

    public function test_switching_a_module_off_closes_its_routes(): void
    {
        $this->signIn('owner');

        // Reachable to begin with.
        $this->getJson('/api/v1/tables/tables')->assertOk();

        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])->assertOk();

        // A flag that only hides a menu entry is decoration. This is the point.
        $this->getJson('/api/v1/tables/tables')
            ->assertStatus(403)
            ->assertJsonPath('code', 'MODULE_DISABLED')
            ->assertJsonPath('module', 'tables');
    }

    public function test_switching_one_module_off_leaves_the_others_alone(): void
    {
        $this->signIn('owner');
        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])->assertOk();

        $this->getJson('/api/v1/menu/items')->assertOk();
        $this->getJson('/api/v1/orders/orders')->assertOk();
    }

    public function test_a_disabled_module_reports_itself_as_unavailable_and_grants_nothing(): void
    {
        $this->signIn('owner');
        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])->assertOk();

        $tables = collect($this->getJson('/api/v1/modules')->json('data'))->firstWhere('key', 'tables');

        $this->assertFalse($tables['available']);
        $this->assertFalse($tables['can_access']);
        $this->assertSame([], $tables['permissions']);
        // The operator never turned it off — the restaurant did. Different fix.
        $this->assertTrue($tables['enabled']);
        $this->assertFalse($tables['enabled_for_restaurant']);
    }

    public function test_a_module_can_be_switched_back_on(): void
    {
        $this->signIn('owner');

        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])->assertOk();
        $this->patchJson('/api/v1/modules/tables', ['enabled' => true])->assertOk();

        $this->getJson('/api/v1/tables/tables')->assertOk();
    }

    public function test_an_essential_module_cannot_be_switched_off(): void
    {
        $this->signIn('owner');

        // A restaurant without a menu or orders is not a restaurant.
        $this->patchJson('/api/v1/modules/menu', ['enabled' => false])
            ->assertStatus(422)
            ->assertJsonValidationErrors('enabled');

        $this->patchJson('/api/v1/modules/orders', ['enabled' => false])
            ->assertStatus(422);

        $this->getJson('/api/v1/menu/items')->assertOk();
    }

    public function test_only_someone_with_system_modules_may_switch_anything(): void
    {
        $this->signIn('waiter');

        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])->assertStatus(403);
        $this->assertNull($this->tenant->refresh()->setting('modules.tables'));
    }

    public function test_switching_an_unknown_module_is_a_clean_404(): void
    {
        $this->signIn('owner');

        $this->patchJson('/api/v1/modules/karaoke', ['enabled' => false])
            ->assertStatus(404)
            ->assertJsonPath('code', 'MODULE_NOT_FOUND');
    }

    public function test_the_switch_needs_an_explicit_value(): void
    {
        $this->signIn('owner');

        $this->patchJson('/api/v1/modules/tables', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('enabled');
    }

    // ============ Isolation ============

    public function test_one_restaurants_switch_does_not_touch_another(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->signIn('owner');
        $this->patchJson('/api/v1/modules/tables', ['enabled' => false])->assertOk();

        // The neighbour never opted out, so reservations still work for them.
        $neighbour = User::factory()->create(['tenant_id' => $other->id]);
        $neighbour->assignRole('owner');
        $this->actingAs($neighbour);

        $this->getJson('/api/v1/tables/tables')->assertOk();
    }

    // ============ Registry behaviour ============

    public function test_the_registry_maps_a_class_back_to_its_module(): void
    {
        $registry = app(ModuleRegistry::class);

        $this->assertSame('menu', $registry->findByClass('Modules\Menu\Http\Controllers\PublicMenuController')?->key);
        $this->assertSame('telegrambots', $registry->findByClass('Modules\TelegramBots\Http\Controllers\BotApiController')?->key);

        // Core controllers belong to no module and must never be gated.
        $this->assertNull($registry->findByClass('App\Http\Controllers\AuthController'));
        $this->assertNull($registry->findByClass(''));
    }

    public function test_modules_are_ordered_for_display_not_by_boot_priority(): void
    {
        $registry = app(ModuleRegistry::class);
        $orders = $registry->all()->map(fn ($m): int => $m->order)->values()->all();

        $this->assertSame($orders, collect($orders)->sort()->values()->all());
        $this->assertSame('menu', $registry->all()->keys()->first());
    }

    public function test_a_restaurant_with_no_settings_has_everything_switched_on(): void
    {
        $registry = app(ModuleRegistry::class);
        $bare = Tenant::query()->create([
            'name' => 'Yangi Kafe', 'slug' => 'yangi-kafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        // Opting out is a deliberate act; a new module must not need a data
        // migration to appear for existing restaurants.
        foreach ($registry->all() as $module) {
            $this->assertTrue($registry->isAvailable($module, $bare), "{$module->key} should default to on.");
        }
    }
}
